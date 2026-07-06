import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { InertiaLinkProps } from '@inertiajs/vue3';
import type { ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function toUrl(href: NonNullable<InertiaLinkProps['href']>) {
    return typeof href === 'string' ? href : href?.url;
}
