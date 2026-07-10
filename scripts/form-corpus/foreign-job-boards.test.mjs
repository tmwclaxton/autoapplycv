import assert from 'node:assert/strict';
import test from 'node:test';
import {
    FOREIGN_JOB_BOARDS,
    buildForeignDiscoverQueries,
    buildForeignSeedUrls,
    foreignBoardCatalogStats,
    inferForeignAtsStyleFromUrl,
} from './lib/foreign-job-boards.mjs';
import { inferAtsStyleFromUrl } from './lib/pattern-signature.mjs';

test('foreign board catalog covers major regions and languages', () => {
    const stats = foreignBoardCatalogStats();

    assert.ok(stats.boards >= 100, `expected 100+ boards, got ${stats.boards}`);
    assert.ok(stats.queries >= 300, `expected 300+ queries, got ${stats.queries}`);
    assert.ok(stats.regions.length >= 20);
    assert.ok(stats.languages.length >= 15);
});

test('every foreign board has domains and localized apply keywords', () => {
    for (const board of FOREIGN_JOB_BOARDS) {
        assert.ok(board.id, `board missing id: ${board.name}`);
        assert.ok(board.domains.length >= 1, `${board.id} missing domains`);
        assert.ok(board.applyKeywords.length >= 2, `${board.id} missing apply keywords`);
        assert.ok(board.languages.length >= 1, `${board.id} missing languages`);
    }
});

test('inferForeignAtsStyleFromUrl maps regional hosts', () => {
    assert.equal(inferForeignAtsStyleFromUrl('https://www.stepstone.de/stellenangebote'), 'stepstone');
    assert.equal(inferForeignAtsStyleFromUrl('https://www.infojobs.net/ofertas'), 'infojobs_es');
    assert.equal(inferForeignAtsStyleFromUrl('https://hh.ru/vacancy/123'), 'hh');
    assert.equal(inferForeignAtsStyleFromUrl('https://www.seek.com.au/job/123'), 'seek');
    assert.equal(inferAtsStyleFromUrl('https://de.indeed.com/viewjob?jk=abc'), 'indeed_de');
});

test('buildForeignDiscoverQueries includes site-scoped and broad localized queries', () => {
    const queries = buildForeignDiscoverQueries();

    assert.ok(queries.some((query) => query.includes('site:stepstone.de')));
    assert.ok(queries.some((query) => query.includes('bewerbungsformular')));
    assert.ok(queries.some((query) => query.includes('site:104.com.tw')));
    assert.ok(queries.some((query) => query.includes('site:gupy.io')));
});

test('buildForeignSeedUrls returns curated apply pages', () => {
    const seeds = buildForeignSeedUrls();

    assert.ok(seeds.length >= 5);
    assert.ok(seeds.every((seed) => seed.url.startsWith('https://')));
});
