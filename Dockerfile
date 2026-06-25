# syntax=docker/dockerfile:1

FROM php:8.5-cli-bookworm AS php_build

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        default-libmysqlclient-dev \
        libicu-dev \
        libsqlite3-dev \
        libzip-dev \
        unzip \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-install \
    bcmath \
    intl \
    opcache \
    pdo_mysql \
    pdo_sqlite \
    zip

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV COMPOSER_ALLOW_SUPERUSER=1

# Install PHP dependencies - cached until composer.lock changes
COPY composer.json composer.lock ./
RUN --mount=type=cache,target=/root/.composer/cache \
    composer install --no-dev --no-interaction --prefer-dist --no-autoloader --no-scripts

# Install Node deps - cached until package-lock.json changes
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy full source code - only invalidates steps below, not the heavy installs above
COPY . .

RUN cp .env.example .env \
    && sed -i 's/^DB_CONNECTION=.*/DB_CONNECTION=sqlite/' .env \
    && sed -i 's|^DB_DATABASE=.*|DB_DATABASE=/app/database/database.sqlite|' .env \
    && sed -i 's/^SESSION_DRIVER=.*/SESSION_DRIVER=array/' .env \
    && sed -i 's/^CACHE_STORE=.*/CACHE_STORE=array/' .env \
    && sed -i 's/^QUEUE_CONNECTION=.*/QUEUE_CONNECTION=sync/' .env \
    && mkdir -p database \
    && touch database/database.sqlite

# Generate optimised classmap autoloader now that all source files are present
RUN composer dump-autoload --optimize --no-dev

RUN php artisan key:generate --force

RUN php artisan wayfinder:generate --with-form --no-interaction

RUN npm run build \
    && npm prune --omit=dev

FROM php:8.5-cli-bookworm AS production

LABEL maintainer="baseProject"

ARG WWWGROUP=1000
ARG WWWUSER=1337

WORKDIR /var/www/html

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Europe/London
ENV SUPERVISOR_PHP_COMMAND="/usr/local/bin/php -d variables_order=EGPCS /var/www/html/artisan serve --host=0.0.0.0 --port=80"
ENV SUPERVISOR_PHP_USER="sail"
ENV WWWUSER=${WWWUSER}
ENV WWWGROUP=${WWWGROUP}

RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        gnupg gosu curl ca-certificates zip unzip git supervisor libcap2-bin \
        default-libmysqlclient-dev \
        libicu-dev \
        libsqlite3-dev \
        libzip-dev \
    && docker-php-ext-install \
        bcmath \
        intl \
        opcache \
        pdo_mysql \
        pdo_sqlite \
        zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && rm -rf /tmp/pear \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get purge -y \
        default-libmysqlclient-dev \
        libicu-dev \
        libsqlite3-dev \
        libzip-dev \
    && apt-get install -y --no-install-recommends \
        libicu72 \
        libmariadb3 \
        libsqlite3-0 \
        libzip4 \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN userdel -r www-data 2>/dev/null || true
RUN groupadd --force -g $WWWGROUP sail || true
RUN useradd -ms /bin/bash --no-user-group -g $WWWGROUP -u $WWWUSER sail || usermod -u $WWWUSER -g $WWWGROUP sail

COPY --from=php_build /app/artisan ./
COPY --from=php_build /app/bootstrap ./bootstrap
COPY --from=php_build /app/app ./app
COPY --from=php_build /app/config ./config
COPY --from=php_build /app/database ./database
COPY --from=php_build /app/public ./public
COPY --from=php_build /app/resources/views ./resources/views
COPY --from=php_build /app/routes ./routes
COPY --from=php_build /app/node_modules ./node_modules
COPY --from=php_build /app/storage ./storage
COPY --from=php_build /app/vendor ./vendor
COPY --from=php_build /app/composer.json ./composer.json
COPY --from=php_build /app/composer.lock ./composer.lock

RUN mkdir -p storage/logs \
        storage/framework/cache/data \
        storage/framework/sessions \
        storage/framework/views \
        bootstrap/cache \
    && chown -R sail:sail storage bootstrap/cache \
    && chmod -R 775 storage bootstrap/cache

COPY docker/workers/ /etc/supervisor/conf.d/workers/
COPY docker/8.5/supervisord.conf /etc/supervisor/supervisord-workers.conf
COPY docker/8.5/start-container /usr/local/bin/start-container
RUN chmod +x /usr/local/bin/start-container

EXPOSE 80

ENTRYPOINT ["start-container"]
