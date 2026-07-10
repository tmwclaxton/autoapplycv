export const ATS_STYLES = [
    'ashby',
    'greenhouse',
    'lever',
    'workday',
    'teamtailor',
    'smartrecruiters',
    'workable',
    'icims',
    'oracle',
    'taleo',
    'personio',
    'pinpoint',
    'wordpress',
    'government',
    'stepstone',
    'xing',
    'infojobs_es',
    'infojobs_br',
    'gupy',
    'pracuj',
    'nofluffjobs',
    'hh',
    'seek',
    'jobstreet',
    'welcometothejungle',
    'jobteaser',
    'naukri',
    'saramin',
    'wanted_kr',
    'doda',
    '104',
    'kariyer',
    'bayt',
    'zhaopin',
    '51job',
    'softgarden',
    'join',
    'custom',
];

export const WIDGET_BUCKETS = [
    'native-inputs',
    'react-select',
    'combobox',
    'pill-radio',
    'checkbox-group',
    'date',
    'masked-phone',
    'repeatable-block',
    'file-adjacent',
    'location-typeahead',
];

export const STRUCTURES = [
    'single-page',
    'wizard',
    'conditional-reveal',
    'iframe-hosted',
    'shadow-dom',
];

export const FIELD_COUNT_BANDS = [
    'small',
    'medium',
    'large',
    'xl',
];

/**
 * @param {number} fieldCount
 * @returns {string}
 */
export function fieldCountBand(fieldCount) {
    if (fieldCount <= 5) {
        return 'small';
    }

    if (fieldCount <= 15) {
        return 'medium';
    }

    if (fieldCount <= 40) {
        return 'large';
    }

    return 'xl';
}

/**
 * @param {{ variety?: { ats_style?: string, widgets?: string[], structure?: string, field_count_band?: string } }} input
 * @returns {string}
 */
export function varietyCellKey(input) {
    const variety = input.variety || {};

    return [
        variety.ats_style || 'unknown',
        (variety.widgets || []).slice().sort().join('+') || 'none',
        variety.structure || 'unknown',
        variety.field_count_band || 'unknown',
    ].join('|');
}

/** @type {Record<string, string>} */
export const ATS_DISCOVER_QUERIES = {
    ashby: 'site:jobs.ashbyhq.com apply application form',
    greenhouse: 'site:boards.greenhouse.io apply application form',
    lever: 'site:jobs.lever.co apply application form',
    workday: 'site:myworkdayjobs.com apply application form',
    teamtailor: 'site:teamtailor.com jobs apply application',
    smartrecruiters: 'site:jobs.smartrecruiters.com apply application form',
    workable: 'site:apply.workable.com apply application form',
    icims: 'site:icims.com careers apply form',
    oracle: 'site:oraclecloud.com careers apply form',
    wordpress: 'site:wpforms.com job application form template',
    government: 'site:gov.uk job application form apply',
    stepstone: 'site:stepstone.de bewerbung stellenangebot apply',
    xing: 'site:xing.com jobs bewerben bewerbung apply',
    infojobs_es: 'site:infojobs.net inscribirse candidatura oferta empleo apply',
    infojobs_br: 'site:infojobs.com.br candidatura candidatar vaga apply',
    gupy: 'site:gupy.io candidatura candidatar apply',
    pracuj: 'site:pracuj.pl aplikuj oferta pracy apply',
    nofluffjobs: 'site:nofluffjobs.com aplikuj apply',
    hh: 'site:hh.ru откликнуться вакансия apply',
    seek: 'site:seek.com.au apply job application',
    jobstreet: 'site:jobstreet.co.id apply lamar job application',
    welcometothejungle: 'site:welcometothejungle.com postuler candidature apply',
    jobteaser: 'site:jobteaser.com candidature postuler bewerbung apply',
    naukri: 'site:naukri.com apply job application',
    saramin: 'site:saramin.co.kr 지원 입사지원 apply',
    wanted_kr: 'site:wanted.co.kr 지원 apply',
    doda: 'site:doda.jp 応募 求人 apply',
    104: 'site:104.com.tw 應徵 線上應徵 apply',
    kariyer: 'site:kariyer.net başvuru basvuru apply',
    bayt: 'site:bayt.com apply job application',
    zhaopin: 'site:zhaopin.com 申请 投递 apply',
    '51job': 'site:51job.com 申请 投递 apply',
    softgarden: 'site:softgarden.io bewerbung apply',
    join: 'site:join.com bewerbung apply candidature',
    custom: 'employment application form html apply name email phone',
};
