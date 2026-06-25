# Local Sail-compatible image: official PHP image (no Ubuntu/onjrej PPA).
FROM php:8.5-cli-bookworm

LABEL maintainer="baseProject"

ARG WWWGROUP
ARG NODE_VERSION=22

WORKDIR /var/www/html

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC
ENV LANG=C.UTF-8
ENV SUPERVISOR_PHP_COMMAND="/usr/local/bin/php -d variables_order=EGPCS /var/www/html/artisan serve --host=0.0.0.0 --port=80"
ENV SUPERVISOR_PHP_USER="sail"
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg gosu git zip unzip supervisor sqlite3 \
        libcap2-bin libzip-dev libicu-dev libpq-dev \
        default-libmysqlclient-dev libsqlite3-dev \
        libfreetype6-dev libjpeg62-turbo-dev libpng-dev libwebp-dev \
        ffmpeg nano dnsutils fswatch python3 librsvg2-bin \
        default-mysql-client postgresql-client \
        tesseract-ocr tesseract-ocr-eng poppler-utils \
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install gd

RUN docker-php-ext-configure intl \
    && docker-php-ext-install intl

RUN docker-php-ext-install \
    bcmath \
    pdo_mysql \
    pdo_pgsql \
    pdo_sqlite \
    zip

RUN pecl install redis \
    && docker-php-ext-enable redis \
    && rm -rf /tmp/pear

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && corepack enable \
    && corepack prepare yarn@stable --activate \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN setcap "cap_net_bind_service=+ep" /usr/local/bin/php

RUN set -eux; \
    gid="${WWWGROUP:-1000}"; \
    case "$gid" in ''|*[!0-9]*) gid=1000 ;; esac; \
    groupadd --force -g "$gid" sail; \
    useradd -ms /bin/bash --no-user-group -g "$gid" -u 1337 sail; \
    git config --global --add safe.directory /var/www/html

COPY start-container /usr/local/bin/start-container
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY php.ini /usr/local/etc/php/conf.d/99-sail.ini
RUN chmod +x /usr/local/bin/start-container

EXPOSE 80/tcp

ENTRYPOINT ["start-container"]
