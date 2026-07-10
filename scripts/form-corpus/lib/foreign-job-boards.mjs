/**
 * Foreign-language job boards and regional aggregators for Firecrawl discovery.
 * Each board gets site: queries with localized apply keywords.
 */

/** @typedef {{ id: string, name: string, region: string, languages: string[], domains: string[], applyKeywords: string[], seeds?: Array<{ url: string, title: string, description: string }>, extraQueries?: string[] }} ForeignJobBoard */

/** @type {ForeignJobBoard[]} */
export const FOREIGN_JOB_BOARDS = [
    // --- DACH (German-speaking) ---
    {
        id: 'stepstone',
        name: 'StepStone',
        region: 'DACH',
        languages: ['de', 'en'],
        domains: ['stepstone.de', 'stepstone.at', 'stepstone.be', 'stepstone.nl'],
        applyKeywords: ['bewerbung', 'bewerben', 'stellenbewerbung', 'online bewerben', 'apply'],
        seeds: [
            { url: 'https://www.stepstone.de/stellenangebote--Software-Engineer.html', title: 'StepStone DE listing', description: 'German job board apply flow' },
        ],
    },
    {
        id: 'xing',
        name: 'XING Jobs',
        region: 'DACH',
        languages: ['de'],
        domains: ['xing.com'],
        applyKeywords: ['jobs bewerben', 'bewerbung', 'stellenangebot apply', 'karriere bewerben'],
    },
    {
        id: 'monster_de',
        name: 'Monster DACH',
        region: 'DACH',
        languages: ['de'],
        domains: ['monster.de', 'monster.at', 'monster.ch'],
        applyKeywords: ['bewerbung', 'stellenangebot bewerben', 'job apply'],
    },
    {
        id: 'jobs_ch',
        name: 'jobs.ch',
        region: 'DACH',
        languages: ['de', 'fr', 'en'],
        domains: ['jobs.ch'],
        applyKeywords: ['bewerbung', 'candidature', 'apply', 'stellenangebot'],
    },
    {
        id: 'jobup',
        name: 'JobUp',
        region: 'DACH',
        languages: ['de', 'fr'],
        domains: ['jobup.ch'],
        applyKeywords: ['bewerbung', 'candidature', 'apply'],
    },
    {
        id: 'jobscout24',
        name: 'JobScout24',
        region: 'DACH',
        languages: ['de'],
        domains: ['jobscout24.ch'],
        applyKeywords: ['bewerbung', 'online bewerben'],
    },
    {
        id: 'karriere_at',
        name: 'Karriere.at',
        region: 'DACH',
        languages: ['de'],
        domains: ['karriere.at'],
        applyKeywords: ['bewerbung', 'online bewerben', 'stellenangebot'],
    },
    {
        id: 'arbeitsagentur',
        name: 'Bundesagentur fur Arbeit',
        region: 'DACH',
        languages: ['de'],
        domains: ['arbeitsagentur.de', 'jobboerse.arbeitsagentur.de'],
        applyKeywords: ['bewerbung', 'stellenangebot', 'online-bewerbung'],
    },
    {
        id: 'jobware',
        name: 'Jobware',
        region: 'DACH',
        languages: ['de'],
        domains: ['jobware.de'],
        applyKeywords: ['bewerbung', 'stellenangebot bewerben'],
    },
    {
        id: 'jobvector',
        name: 'jobvector',
        region: 'DACH',
        languages: ['de', 'en'],
        domains: ['jobvector.de'],
        applyKeywords: ['bewerbung', 'apply', 'stellenangebot'],
    },
    {
        id: 'kimeta',
        name: 'kimeta',
        region: 'DACH',
        languages: ['de'],
        domains: ['kimeta.de'],
        applyKeywords: ['bewerbung', 'stellenangebot'],
    },
    {
        id: 'stellenanzeigen',
        name: 'stellenanzeigen.de',
        region: 'DACH',
        languages: ['de'],
        domains: ['stellenanzeigen.de'],
        applyKeywords: ['bewerbung', 'online bewerben'],
    },
    {
        id: 'academics',
        name: 'academics',
        region: 'DACH',
        languages: ['de', 'en'],
        domains: ['academics.de'],
        applyKeywords: ['bewerbung', 'application', 'stellenangebot'],
    },
    {
        id: 'meinestadt',
        name: 'meinestadt.de Jobs',
        region: 'DACH',
        languages: ['de'],
        domains: ['meinestadt.de'],
        applyKeywords: ['jobs bewerbung', 'stellenangebot bewerben'],
    },
    {
        id: 'indeed_de',
        name: 'Indeed Germany',
        region: 'DACH',
        languages: ['de'],
        domains: ['de.indeed.com', 'indeed.de'],
        applyKeywords: ['bewerbung', 'apply', 'stellenangebot bewerben'],
    },
    {
        id: 'glassdoor_de',
        name: 'Glassdoor DE',
        region: 'DACH',
        languages: ['de'],
        domains: ['glassdoor.de'],
        applyKeywords: ['bewerbung', 'apply', 'stellenangebot'],
    },

    // --- France ---
    {
        id: 'indeed_fr',
        name: 'Indeed France',
        region: 'France',
        languages: ['fr'],
        domains: ['fr.indeed.com', 'indeed.fr'],
        applyKeywords: ['candidature', 'postuler', 'offre emploi apply'],
    },
    {
        id: 'francetravail',
        name: 'France Travail',
        region: 'France',
        languages: ['fr'],
        domains: ['francetravail.fr', 'pole-emploi.fr'],
        applyKeywords: ['candidature', 'postuler', 'offre emploi'],
    },
    {
        id: 'apec',
        name: 'APEC',
        region: 'France',
        languages: ['fr'],
        domains: ['apec.fr'],
        applyKeywords: ['candidature', 'postuler', 'offre emploi'],
    },
    {
        id: 'welcometothejungle',
        name: 'Welcome to the Jungle',
        region: 'France',
        languages: ['fr', 'en'],
        domains: ['welcometothejungle.com', 'welcometothejungle.co'],
        applyKeywords: ['postuler', 'candidature', 'apply', 'offre emploi'],
        seeds: [
            { url: 'https://www.welcometothejungle.com/fr/companies/example/jobs', title: 'WTTJ listing', description: 'French job board apply' },
        ],
    },
    {
        id: 'cadremploi',
        name: 'Cadremploi',
        region: 'France',
        languages: ['fr'],
        domains: ['cadremploi.fr'],
        applyKeywords: ['candidature', 'postuler', 'offre emploi'],
    },
    {
        id: 'regionsjob',
        name: 'RegionsJob',
        region: 'France',
        languages: ['fr'],
        domains: ['regionsjob.com'],
        applyKeywords: ['candidature', 'postuler'],
    },
    {
        id: 'monster_fr',
        name: 'Monster France',
        region: 'France',
        languages: ['fr'],
        domains: ['monster.fr'],
        applyKeywords: ['candidature', 'postuler', 'offre emploi'],
    },
    {
        id: 'keljob',
        name: 'Keljob',
        region: 'France',
        languages: ['fr'],
        domains: ['keljob.com'],
        applyKeywords: ['candidature', 'postuler'],
    },
    {
        id: 'jobteaser',
        name: 'JobTeaser',
        region: 'France',
        languages: ['fr', 'en', 'de'],
        domains: ['jobteaser.com', 'jobteaser.fr', 'jobteaser.de'],
        applyKeywords: ['candidature', 'postuler', 'bewerbung', 'apply'],
    },
    {
        id: 'hellowork',
        name: 'HelloWork',
        region: 'France',
        languages: ['fr'],
        domains: ['hellowork.com'],
        applyKeywords: ['candidature', 'postuler', 'offre emploi'],
    },
    {
        id: 'figaro_emploi',
        name: 'Figaro Emploi',
        region: 'France',
        languages: ['fr'],
        domains: ['emploi.lefigaro.fr'],
        applyKeywords: ['candidature', 'postuler'],
    },
    {
        id: 'chooseyourboss',
        name: 'Choose Your Boss',
        region: 'France',
        languages: ['fr'],
        domains: ['chooseyourboss.com'],
        applyKeywords: ['candidature', 'postuler'],
    },

    // --- Spain ---
    {
        id: 'infojobs_es',
        name: 'InfoJobs Spain',
        region: 'Spain',
        languages: ['es'],
        domains: ['infojobs.net'],
        applyKeywords: ['inscribirse', 'candidatura', 'oferta empleo apply', 'solicitar empleo'],
        seeds: [
            { url: 'https://www.infojobs.net/ofertas-trabajo', title: 'InfoJobs ES', description: 'Spanish job board' },
        ],
    },
    {
        id: 'indeed_es',
        name: 'Indeed Spain',
        region: 'Spain',
        languages: ['es'],
        domains: ['es.indeed.com', 'indeed.es'],
        applyKeywords: ['inscribirse', 'candidatura', 'solicitar empleo'],
    },
    {
        id: 'infoempleo',
        name: 'Infoempleo',
        region: 'Spain',
        languages: ['es'],
        domains: ['infoempleo.com'],
        applyKeywords: ['inscribirse', 'candidatura', 'oferta empleo'],
    },
    {
        id: 'ticjob',
        name: 'Ticjob',
        region: 'Spain',
        languages: ['es'],
        domains: ['ticjob.es'],
        applyKeywords: ['inscribirse', 'candidatura', 'apply'],
    },
    {
        id: 'monster_es',
        name: 'Monster Spain',
        region: 'Spain',
        languages: ['es'],
        domains: ['monster.es'],
        applyKeywords: ['inscribirse', 'candidatura'],
    },
    {
        id: 'trabajos',
        name: 'Trabajos.com',
        region: 'Spain',
        languages: ['es'],
        domains: ['trabajos.com'],
        applyKeywords: ['inscribirse', 'candidatura', 'oferta empleo'],
    },
    {
        id: 'laboris',
        name: 'Laboris',
        region: 'Spain',
        languages: ['es'],
        domains: ['laboris.net'],
        applyKeywords: ['inscribirse', 'candidatura'],
    },
    {
        id: 'computrabajo_es',
        name: 'Computrabajo Spain',
        region: 'Spain',
        languages: ['es'],
        domains: ['computrabajo.es'],
        applyKeywords: ['inscribirse', 'postular', 'oferta empleo'],
    },

    // --- Italy ---
    {
        id: 'infojobs_it',
        name: 'InfoJobs Italy',
        region: 'Italy',
        languages: ['it'],
        domains: ['infojobs.it'],
        applyKeywords: ['candidatura', 'invio candidatura', 'offerta lavoro apply'],
    },
    {
        id: 'indeed_it',
        name: 'Indeed Italy',
        region: 'Italy',
        languages: ['it'],
        domains: ['it.indeed.com', 'indeed.it'],
        applyKeywords: ['candidatura', 'invio candidatura', 'offerta lavoro'],
    },
    {
        id: 'monster_it',
        name: 'Monster Italy',
        region: 'Italy',
        languages: ['it'],
        domains: ['monster.it'],
        applyKeywords: ['candidatura', 'offerta lavoro'],
    },
    {
        id: 'subito_lavoro',
        name: 'Subito Lavoro',
        region: 'Italy',
        languages: ['it'],
        domains: ['subito.it'],
        applyKeywords: ['lavoro candidatura', 'annuncio lavoro apply'],
    },
    {
        id: 'jobrapido_it',
        name: 'Jobrapido Italy',
        region: 'Italy',
        languages: ['it'],
        domains: ['jobrapido.it'],
        applyKeywords: ['candidatura', 'offerta lavoro'],
    },
    {
        id: 'bakeca_lavoro',
        name: 'Bakeca Lavoro',
        region: 'Italy',
        languages: ['it'],
        domains: ['bakeca.it'],
        applyKeywords: ['candidatura', 'annuncio lavoro'],
    },

    // --- Netherlands ---
    {
        id: 'indeed_nl',
        name: 'Indeed Netherlands',
        region: 'Netherlands',
        languages: ['nl'],
        domains: ['nl.indeed.com', 'indeed.nl'],
        applyKeywords: ['solliciteren', 'sollicitatie', 'vacature apply'],
    },
    {
        id: 'monster_nl',
        name: 'Monsterboard NL',
        region: 'Netherlands',
        languages: ['nl'],
        domains: ['monsterboard.nl'],
        applyKeywords: ['solliciteren', 'sollicitatie'],
    },
    {
        id: 'nationale_vacaturebank',
        name: 'Nationale Vacaturebank',
        region: 'Netherlands',
        languages: ['nl'],
        domains: ['nationalevacaturebank.nl'],
        applyKeywords: ['solliciteren', 'sollicitatie', 'vacature'],
    },
    {
        id: 'werkenbij',
        name: 'Werk.nl',
        region: 'Netherlands',
        languages: ['nl'],
        domains: ['werk.nl'],
        applyKeywords: ['solliciteren', 'vacature'],
    },

    // --- Poland ---
    {
        id: 'pracuj',
        name: 'Pracuj.pl',
        region: 'Poland',
        languages: ['pl'],
        domains: ['pracuj.pl'],
        applyKeywords: ['aplikuj', 'aplikacja', 'oferta pracy apply', 'formularz aplikacyjny'],
        seeds: [
            { url: 'https://www.pracuj.pl/praca', title: 'Pracuj.pl listings', description: 'Polish job board' },
        ],
    },
    {
        id: 'nofluffjobs',
        name: 'NoFluffJobs',
        region: 'Poland',
        languages: ['pl', 'en'],
        domains: ['nofluffjobs.com'],
        applyKeywords: ['aplikuj', 'apply', 'oferta pracy'],
    },
    {
        id: 'bulldogjob',
        name: 'Bulldogjob',
        region: 'Poland',
        languages: ['pl'],
        domains: ['bulldogjob.pl'],
        applyKeywords: ['aplikuj', 'oferta pracy'],
    },
    {
        id: 'justjoin',
        name: 'Just Join IT',
        region: 'Poland',
        languages: ['pl', 'en'],
        domains: ['justjoin.it'],
        applyKeywords: ['aplikuj', 'apply', 'oferta pracy'],
    },
    {
        id: 'indeed_pl',
        name: 'Indeed Poland',
        region: 'Poland',
        languages: ['pl'],
        domains: ['pl.indeed.com', 'indeed.pl'],
        applyKeywords: ['aplikuj', 'oferta pracy apply'],
    },

    // --- Czech / Slovakia ---
    {
        id: 'jobs_cz',
        name: 'Jobs.cz',
        region: 'Czechia',
        languages: ['cs'],
        domains: ['jobs.cz', 'profesia.cz'],
        applyKeywords: ['odpovedet', 'přihláška', 'přihlásit se', 'nabídka práce'],
    },
    {
        id: 'profesia_sk',
        name: 'Profesia SK',
        region: 'Slovakia',
        languages: ['sk'],
        domains: ['profesia.sk'],
        applyKeywords: ['prihlásiť sa', 'odpovedať', 'ponuka práce'],
    },
    {
        id: 'kariera_sk',
        name: 'Kariera.sk',
        region: 'Slovakia',
        languages: ['sk'],
        domains: ['kariera.sk'],
        applyKeywords: ['prihlásiť sa', 'ponuka práce'],
    },

    // --- Hungary ---
    {
        id: 'profession_hu',
        name: 'Profession.hu',
        region: 'Hungary',
        languages: ['hu'],
        domains: ['profession.hu'],
        applyKeywords: ['jelentkezés', 'állás apply', 'jelentkezem'],
    },
    {
        id: 'jobline_hu',
        name: 'Jobline.hu',
        region: 'Hungary',
        languages: ['hu'],
        domains: ['jobline.hu'],
        applyKeywords: ['jelentkezés', 'állás'],
    },

    // --- Romania / Bulgaria ---
    {
        id: 'ejobs',
        name: 'eJobs',
        region: 'Romania',
        languages: ['ro'],
        domains: ['ejobs.ro'],
        applyKeywords: ['aplicare', 'aplica', 'loc de munca'],
    },
    {
        id: 'bestjobs',
        name: 'BestJobs',
        region: 'Romania',
        languages: ['ro'],
        domains: ['bestjobs.eu', 'bestjobs.ro'],
        applyKeywords: ['aplicare', 'aplica', 'loc de munca'],
    },
    {
        id: 'jobs_bg',
        name: 'Jobs.bg',
        region: 'Bulgaria',
        languages: ['bg'],
        domains: ['jobs.bg'],
        applyKeywords: ['кандидатстване', 'apply', 'обява работа'],
    },

    // --- Russia / CIS ---
    {
        id: 'hh',
        name: 'HeadHunter',
        region: 'Russia',
        languages: ['ru'],
        domains: ['hh.ru', 'headhunter.ru'],
        applyKeywords: ['откликнуться', 'отклик', 'вакансия apply', 'резюме'],
        seeds: [
            { url: 'https://hh.ru/search/vacancy', title: 'HeadHunter vacancies', description: 'Russian job board' },
        ],
    },
    {
        id: 'superjob',
        name: 'SuperJob',
        region: 'Russia',
        languages: ['ru'],
        domains: ['superjob.ru'],
        applyKeywords: ['откликнуться', 'отклик', 'вакансия'],
    },
    {
        id: 'rabota',
        name: 'Rabota.ru',
        region: 'Russia',
        languages: ['ru'],
        domains: ['rabota.ru'],
        applyKeywords: ['откликнуться', 'отклик', 'вакансия'],
    },
    {
        id: 'worki',
        name: 'Worki.ru',
        region: 'Russia',
        languages: ['ru'],
        domains: ['worki.ru'],
        applyKeywords: ['откликнуться', 'вакансия'],
    },

    // --- Ukraine ---
    {
        id: 'work_ua',
        name: 'Work.ua',
        region: 'Ukraine',
        languages: ['uk', 'ru'],
        domains: ['work.ua'],
        applyKeywords: ['відгукнутися', 'відгук', 'вакансія apply'],
    },
    {
        id: 'robota_ua',
        name: 'Robota.ua',
        region: 'Ukraine',
        languages: ['uk'],
        domains: ['robota.ua'],
        applyKeywords: ['відгукнутися', 'вакансія'],
    },

    // --- Turkey ---
    {
        id: 'kariyer',
        name: 'Kariyer.net',
        region: 'Turkey',
        languages: ['tr'],
        domains: ['kariyer.net'],
        applyKeywords: ['başvuru', 'basvuru', 'iş ilanı apply', 'basvur'],
    },
    {
        id: 'yenibiris',
        name: 'Yenibiris',
        region: 'Turkey',
        languages: ['tr'],
        domains: ['yenibiris.com'],
        applyKeywords: ['başvuru', 'basvuru', 'is ilani'],
    },
    {
        id: 'indeed_tr',
        name: 'Indeed Turkey',
        region: 'Turkey',
        languages: ['tr'],
        domains: ['tr.indeed.com', 'indeed.com.tr'],
        applyKeywords: ['başvuru', 'basvuru', 'is ilani apply'],
    },

    // --- Middle East ---
    {
        id: 'bayt',
        name: 'Bayt.com',
        region: 'Middle East',
        languages: ['ar', 'en'],
        domains: ['bayt.com'],
        applyKeywords: ['apply', 'application', 'تقديم', 'وظيفة apply'],
    },
    {
        id: 'gulfTalent',
        name: 'GulfTalent',
        region: 'Middle East',
        languages: ['en', 'ar'],
        domains: ['gulftalent.com'],
        applyKeywords: ['apply', 'job application', 'vacancy apply'],
    },
    {
        id: 'naukrigulf',
        name: 'Naukrigulf',
        region: 'Middle East',
        languages: ['en', 'ar'],
        domains: ['naukrigulf.com'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'indeed_ae',
        name: 'Indeed UAE',
        region: 'Middle East',
        languages: ['en', 'ar'],
        domains: ['ae.indeed.com', 'indeed.ae'],
        applyKeywords: ['apply', 'job application', 'vacancy'],
    },

    // --- India ---
    {
        id: 'naukri',
        name: 'Naukri.com',
        region: 'India',
        languages: ['en', 'hi'],
        domains: ['naukri.com'],
        applyKeywords: ['apply', 'job application', 'register apply'],
        seeds: [
            { url: 'https://www.naukri.com/job-listings', title: 'Naukri listings', description: 'Indian job board' },
        ],
    },
    {
        id: 'shine',
        name: 'Shine.com',
        region: 'India',
        languages: ['en'],
        domains: ['shine.com'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'foundit',
        name: 'Foundit (Monster India)',
        region: 'India',
        languages: ['en'],
        domains: ['foundit.in', 'monsterindia.com'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'timesjobs',
        name: 'TimesJobs',
        region: 'India',
        languages: ['en'],
        domains: ['timesjobs.com'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'indeed_in',
        name: 'Indeed India',
        region: 'India',
        languages: ['en'],
        domains: ['in.indeed.com', 'indeed.co.in'],
        applyKeywords: ['apply', 'job application'],
    },

    // --- China ---
    {
        id: 'zhaopin',
        name: 'Zhaopin',
        region: 'China',
        languages: ['zh'],
        domains: ['zhaopin.com'],
        applyKeywords: ['申请', '投递', '在线申请', 'apply'],
    },
    {
        id: '51job',
        name: '51job',
        region: 'China',
        languages: ['zh'],
        domains: ['51job.com'],
        applyKeywords: ['申请', '投递', '在线申请'],
    },
    {
        id: 'liepin',
        name: 'Liepin',
        region: 'China',
        languages: ['zh'],
        domains: ['liepin.com'],
        applyKeywords: ['申请', '投递', '在线申请'],
    },
    {
        id: 'boss_zhipin',
        name: 'Boss Zhipin',
        region: 'China',
        languages: ['zh'],
        domains: ['zhipin.com'],
        applyKeywords: ['申请', '投递', '在线沟通 apply'],
    },

    // --- Japan ---
    {
        id: 'doda',
        name: 'doda',
        region: 'Japan',
        languages: ['ja'],
        domains: ['doda.jp'],
        applyKeywords: ['応募', 'エントリー', '求人 apply', '応募フォーム'],
    },
    {
        id: 'rikunabi',
        name: 'Rikunabi',
        region: 'Japan',
        languages: ['ja'],
        domains: ['rikunabi.com', 'mynavi.jp'],
        applyKeywords: ['応募', 'エントリー', '求人'],
    },
    {
        id: 'en_japan',
        name: 'en Japan',
        region: 'Japan',
        languages: ['ja', 'en'],
        domains: ['en-japan.com'],
        applyKeywords: ['応募', 'apply', '求人'],
    },
    {
        id: 'indeed_jp',
        name: 'Indeed Japan',
        region: 'Japan',
        languages: ['ja'],
        domains: ['jp.indeed.com'],
        applyKeywords: ['応募', 'apply', '求人'],
    },
    {
        id: 'wantedly',
        name: 'Wantedly',
        region: 'Japan',
        languages: ['ja', 'en'],
        domains: ['wantedly.com'],
        applyKeywords: ['応募', 'apply', 'entry'],
    },

    // --- Korea ---
    {
        id: 'saramin',
        name: 'Saramin',
        region: 'Korea',
        languages: ['ko'],
        domains: ['saramin.co.kr'],
        applyKeywords: ['지원', '입사지원', '채용 apply', '온라인 지원'],
    },
    {
        id: 'jobkorea',
        name: 'JobKorea',
        region: 'Korea',
        languages: ['ko'],
        domains: ['jobkorea.co.kr'],
        applyKeywords: ['지원', '입사지원', '채용'],
    },
    {
        id: 'wanted_kr',
        name: 'Wanted',
        region: 'Korea',
        languages: ['ko', 'en'],
        domains: ['wanted.co.kr'],
        applyKeywords: ['지원', 'apply', '채용'],
    },
    {
        id: 'incruit',
        name: 'Incruit',
        region: 'Korea',
        languages: ['ko'],
        domains: ['incruit.com'],
        applyKeywords: ['지원', '입사지원'],
    },

    // --- Taiwan ---
    {
        id: '104',
        name: '104 Job Bank',
        region: 'Taiwan',
        languages: ['zh-TW'],
        domains: ['104.com.tw'],
        applyKeywords: ['應徵', '線上應徵', '投遞履歷', 'apply'],
    },
    {
        id: '1111',
        name: '1111 Job Bank',
        region: 'Taiwan',
        languages: ['zh-TW'],
        domains: ['1111.com.tw'],
        applyKeywords: ['應徵', '線上應徵', '投遞履歷'],
    },
    {
        id: '518',
        name: '518 Job Bank',
        region: 'Taiwan',
        languages: ['zh-TW'],
        domains: ['518.com.tw'],
        applyKeywords: ['應徵', '線上應徵'],
    },
    {
        id: 'yes123',
        name: 'yes123',
        region: 'Taiwan',
        languages: ['zh-TW'],
        domains: ['yes123.com.tw'],
        applyKeywords: ['應徵', '線上應徵'],
    },

    // --- Hong Kong ---
    {
        id: 'jobsdb_hk',
        name: 'JobsDB Hong Kong',
        region: 'Hong Kong',
        languages: ['zh', 'en'],
        domains: ['hk.jobsdb.com', 'jobsdb.com'],
        applyKeywords: ['apply', '應徵', 'job application'],
    },
    {
        id: 'cpjobs',
        name: 'CPJobs',
        region: 'Hong Kong',
        languages: ['zh', 'en'],
        domains: ['cpjobs.com'],
        applyKeywords: ['apply', '應徵'],
    },

    // --- Southeast Asia ---
    {
        id: 'jobstreet',
        name: 'JobStreet',
        region: 'Southeast Asia',
        languages: ['en', 'id', 'ms', 'th', 'vi'],
        domains: ['jobstreet.co.id', 'jobstreet.com.my', 'jobstreet.com.ph', 'jobstreet.com.sg', 'jobstreet.vn'],
        applyKeywords: ['apply', 'lamar', 'สมัคร', 'ứng tuyển', 'job application'],
        seeds: [
            { url: 'https://www.jobstreet.co.id/jobs', title: 'JobStreet ID', description: 'SEA job board' },
        ],
    },
    {
        id: 'jobsdb_sea',
        name: 'JobsDB SEA',
        region: 'Southeast Asia',
        languages: ['en', 'th'],
        domains: ['th.jobsdb.com', 'jobsdb.co.th'],
        applyKeywords: ['apply', 'สมัคร', 'job application'],
    },
    {
        id: 'mycareersfuture',
        name: 'MyCareersFuture',
        region: 'Singapore',
        languages: ['en'],
        domains: ['mycareersfuture.gov.sg'],
        applyKeywords: ['apply', 'job application', 'vacancy apply'],
    },
    {
        id: 'glints',
        name: 'Glints',
        region: 'Southeast Asia',
        languages: ['en', 'id'],
        domains: ['glints.com'],
        applyKeywords: ['apply', 'lamar', 'job application'],
    },
    {
        id: 'kalibrr',
        name: 'Kalibrr',
        region: 'Philippines',
        languages: ['en', 'tl'],
        domains: ['kalibrr.com'],
        applyKeywords: ['apply', 'job application'],
    },

    // --- Australia / NZ ---
    {
        id: 'seek',
        name: 'SEEK',
        region: 'Oceania',
        languages: ['en'],
        domains: ['seek.com.au', 'seek.co.nz'],
        applyKeywords: ['apply', 'job application', 'quick apply'],
        seeds: [
            { url: 'https://www.seek.com.au/jobs', title: 'SEEK Australia', description: 'AU job board apply' },
        ],
    },
    {
        id: 'indeed_au',
        name: 'Indeed Australia',
        region: 'Oceania',
        languages: ['en'],
        domains: ['au.indeed.com', 'indeed.com.au'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'jora',
        name: 'Jora',
        region: 'Oceania',
        languages: ['en'],
        domains: ['jora.com', 'au.jora.com'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'careerone',
        name: 'CareerOne',
        region: 'Oceania',
        languages: ['en'],
        domains: ['careerone.com.au'],
        applyKeywords: ['apply', 'job application'],
    },

    // --- Brazil / LATAM ---
    {
        id: 'infojobs_br',
        name: 'InfoJobs Brazil',
        region: 'Brazil',
        languages: ['pt'],
        domains: ['infojobs.com.br'],
        applyKeywords: ['candidatura', 'candidatar', 'vaga apply', 'inscrição'],
        seeds: [
            { url: 'https://www.infojobs.com.br/vagas', title: 'InfoJobs BR', description: 'Brazilian job board' },
        ],
    },
    {
        id: 'catho',
        name: 'Catho',
        region: 'Brazil',
        languages: ['pt'],
        domains: ['catho.com.br'],
        applyKeywords: ['candidatura', 'candidatar', 'vaga'],
    },
    {
        id: 'vagas',
        name: 'Vagas.com',
        region: 'Brazil',
        languages: ['pt'],
        domains: ['vagas.com.br'],
        applyKeywords: ['candidatura', 'candidatar', 'vaga apply'],
    },
    {
        id: 'gupy',
        name: 'Gupy',
        region: 'Brazil',
        languages: ['pt'],
        domains: ['gupy.io', 'portal.gupy.io'],
        applyKeywords: ['candidatura', 'candidatar', 'apply', 'vaga'],
    },
    {
        id: 'indeed_br',
        name: 'Indeed Brazil',
        region: 'Brazil',
        languages: ['pt'],
        domains: ['br.indeed.com', 'indeed.com.br'],
        applyKeywords: ['candidatura', 'candidatar', 'vaga apply'],
    },
    {
        id: 'computrabajo_latam',
        name: 'Computrabajo LATAM',
        region: 'LATAM',
        languages: ['es', 'pt'],
        domains: ['computrabajo.com.ar', 'computrabajo.com.mx', 'computrabajo.com.co', 'computrabajo.cl', 'computrabajo.com.pe'],
        applyKeywords: ['postular', 'inscribirse', 'oferta empleo', 'candidatura'],
    },
    {
        id: 'bumeran',
        name: 'Bumeran',
        region: 'LATAM',
        languages: ['es'],
        domains: ['bumeran.com.ar', 'bumeran.com.mx', 'bumeran.com.pe'],
        applyKeywords: ['postular', 'inscribirse', 'oferta empleo'],
    },
    {
        id: 'occ',
        name: 'OCC Mundial',
        region: 'Mexico',
        languages: ['es'],
        domains: ['occ.com.mx'],
        applyKeywords: ['postular', 'inscribirse', 'oferta empleo apply'],
    },
    {
        id: 'elempleo',
        name: 'elempleo.com',
        region: 'Colombia',
        languages: ['es'],
        domains: ['elempleo.com'],
        applyKeywords: ['postular', 'inscribirse', 'oferta empleo'],
    },

    // --- Nordics ---
    {
        id: 'finn',
        name: 'FINN.no',
        region: 'Nordics',
        languages: ['no'],
        domains: ['finn.no'],
        applyKeywords: ['søke', 'søknad', 'apply', 'stilling'],
    },
    {
        id: 'blocket_job',
        name: 'Blocket Jobb',
        region: 'Nordics',
        languages: ['sv'],
        domains: ['blocket.se'],
        applyKeywords: ['ansök', 'ansökan', 'jobb apply'],
    },
    {
        id: 'jobindex',
        name: 'Jobindex',
        region: 'Nordics',
        languages: ['da'],
        domains: ['jobindex.dk'],
        applyKeywords: ['ansøg', 'ansøgning', 'job apply'],
    },
    {
        id: 'monster_se',
        name: 'Monster Sweden',
        region: 'Nordics',
        languages: ['sv'],
        domains: ['monster.se'],
        applyKeywords: ['ansök', 'ansökan', 'jobb'],
    },
    {
        id: 'arbetsformedlingen',
        name: 'Arbetsformedlingen',
        region: 'Nordics',
        languages: ['sv'],
        domains: ['arbetsformedlingen.se'],
        applyKeywords: ['ansök', 'ansökan', 'platsbanken'],
    },

    // --- Portugal ---
    {
        id: 'net_empregos',
        name: 'Net-Empregos',
        region: 'Portugal',
        languages: ['pt'],
        domains: ['net-empregos.com'],
        applyKeywords: ['candidatura', 'candidatar', 'emprego apply'],
    },
    {
        id: 'indeed_pt',
        name: 'Indeed Portugal',
        region: 'Portugal',
        languages: ['pt'],
        domains: ['pt.indeed.com', 'indeed.pt'],
        applyKeywords: ['candidatura', 'candidatar', 'emprego'],
    },

    // --- Greece ---
    {
        id: 'kariera_gr',
        name: 'Kariera.gr',
        region: 'Greece',
        languages: ['el'],
        domains: ['kariera.gr'],
        applyKeywords: ['αίτηση', 'apply', 'θέση εργασίας'],
    },

    // --- Israel ---
    {
        id: 'alljobs',
        name: 'AllJobs',
        region: 'Israel',
        languages: ['he', 'en'],
        domains: ['alljobs.co.il'],
        applyKeywords: ['apply', 'מועמדות', 'job application'],
    },
    {
        id: 'drushim',
        name: 'Drushim',
        region: 'Israel',
        languages: ['he'],
        domains: ['drushim.co.il'],
        applyKeywords: ['מועמדות', 'apply', 'דרושים'],
    },

    // --- South Africa ---
    {
        id: 'careers24',
        name: 'Careers24',
        region: 'South Africa',
        languages: ['en'],
        domains: ['careers24.com'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'pnet',
        name: 'PNet',
        region: 'South Africa',
        languages: ['en'],
        domains: ['pnet.co.za'],
        applyKeywords: ['apply', 'job application'],
    },

    // --- EU ATS with localized tenants (already partially covered, expand) ---
    {
        id: 'personio',
        name: 'Personio',
        region: 'EU',
        languages: ['de', 'en', 'fr', 'es'],
        domains: ['personio.de', 'personio.com', 'jobs.personio.com'],
        applyKeywords: ['bewerbung', 'apply', 'candidature', 'candidatura', 'application'],
        seeds: [
            { url: 'https://cocunat.jobs.personio.de/job/2210442?language=de&display=de', title: 'Personio DE apply', description: 'German Personio application form' },
        ],
        extraQueries: ['site:jobs.personio.de apply', 'site:*.jobs.personio.de job apply', 'site:jobs.personio.com apply'],
    },
    {
        id: 'recruitee_eu',
        name: 'Recruitee EU',
        region: 'EU',
        languages: ['en', 'de', 'fr', 'nl', 'pl'],
        domains: ['recruitee.com'],
        applyKeywords: ['apply', 'bewerbung', 'candidature', 'solliciteren', 'aplikuj'],
        extraQueries: ['site:recruitee.com/o apply form', 'site:*.recruitee.com apply'],
    },
    {
        id: 'teamtailor_eu',
        name: 'Teamtailor EU',
        region: 'EU',
        languages: ['en', 'sv', 'de', 'fr'],
        domains: ['teamtailor.com'],
        applyKeywords: ['apply', 'ansök', 'bewerbung', 'candidature', 'applications/new'],
        extraQueries: ['site:teamtailor.com/jobs apply', 'site:*.teamtailor.com applications/new'],
    },
    {
        id: 'greenhouse_eu',
        name: 'Greenhouse EU',
        region: 'EU',
        languages: ['en', 'de', 'fr'],
        domains: ['boards.eu.greenhouse.io', 'job-boards.eu.greenhouse.io'],
        applyKeywords: ['apply', 'bewerbung', 'candidature', 'application form'],
        extraQueries: ['site:boards.eu.greenhouse.io apply', 'site:job-boards.eu.greenhouse.io apply'],
    },
    {
        id: 'lever_eu',
        name: 'Lever EU',
        region: 'EU',
        languages: ['en', 'de', 'fr'],
        domains: ['jobs.eu.lever.co'],
        applyKeywords: ['apply', 'bewerbung', 'candidature', 'application'],
        extraQueries: ['site:jobs.eu.lever.co apply'],
    },
    {
        id: 'softgarden',
        name: 'Softgarden',
        region: 'DACH',
        languages: ['de', 'en'],
        domains: ['softgarden.io', 'career.softgarden.de'],
        applyKeywords: ['bewerbung', 'apply', 'stellenangebot'],
    },
    {
        id: 'onlyfy',
        name: 'Onlyfy (XING eRecruiting)',
        region: 'DACH',
        languages: ['de', 'en'],
        domains: ['onlyfy.com', 'onlyfy.jobs'],
        applyKeywords: ['bewerbung', 'apply', 'jobs bewerben'],
    },
    {
        id: 'join',
        name: 'JOIN',
        region: 'EU',
        languages: ['de', 'en', 'fr'],
        domains: ['join.com'],
        applyKeywords: ['bewerbung', 'apply', 'candidature'],
    },
    {
        id: 'breezy_eu',
        name: 'Breezy HR EU',
        region: 'EU',
        languages: ['en', 'de', 'es'],
        domains: ['breezy.hr'],
        applyKeywords: ['apply', 'bewerbung', 'candidatura'],
    },

    // --- Africa (additional) ---
    {
        id: 'jobberman',
        name: 'Jobberman',
        region: 'Africa',
        languages: ['en'],
        domains: ['jobberman.com'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'brightermonday',
        name: 'BrighterMonday',
        region: 'Africa',
        languages: ['en'],
        domains: ['brightermonday.co.ke', 'brightermonday.co.ug'],
        applyKeywords: ['apply', 'job application'],
    },

    // --- Canada (French + English) ---
    {
        id: 'indeed_ca',
        name: 'Indeed Canada',
        region: 'Canada',
        languages: ['en', 'fr'],
        domains: ['ca.indeed.com', 'indeed.ca'],
        applyKeywords: ['apply', 'postuler', 'candidature', 'job application'],
    },
    {
        id: 'jobbank',
        name: 'Job Bank Canada',
        region: 'Canada',
        languages: ['en', 'fr'],
        domains: ['jobbank.gc.ca'],
        applyKeywords: ['apply', 'postuler', 'candidature', 'job application'],
    },
    {
        id: 'emploiquebec',
        name: 'Emploi Quebec',
        region: 'Canada',
        languages: ['fr'],
        domains: ['emploiquebec.gouv.qc.ca'],
        applyKeywords: ['postuler', 'candidature', 'offre emploi'],
    },

    // --- Ireland ---
    {
        id: 'irishjobs',
        name: 'IrishJobs.ie',
        region: 'Ireland',
        languages: ['en'],
        domains: ['irishjobs.ie'],
        applyKeywords: ['apply', 'job application'],
    },
    {
        id: 'jobs_ie',
        name: 'Jobs.ie',
        region: 'Ireland',
        languages: ['en'],
        domains: ['jobs.ie'],
        applyKeywords: ['apply', 'job application'],
    },

    // --- Belgium ---
    {
        id: 'vdab',
        name: 'VDAB',
        region: 'Belgium',
        languages: ['nl'],
        domains: ['vdab.be'],
        applyKeywords: ['solliciteren', 'sollicitatie', 'vacature'],
    },
    {
        id: 'leforem',
        name: 'Le Forem',
        region: 'Belgium',
        languages: ['fr'],
        domains: ['leforem.be'],
        applyKeywords: ['candidature', 'postuler', 'offre emploi'],
    },
    {
        id: 'jobat',
        name: 'Jobat',
        region: 'Belgium',
        languages: ['nl', 'fr'],
        domains: ['jobat.be'],
        applyKeywords: ['solliciteren', 'candidature', 'apply'],
    },

    // --- Switzerland (multilingual) ---
    {
        id: 'jobs_ch_extra',
        name: 'Swiss public employment',
        region: 'Switzerland',
        languages: ['de', 'fr', 'it'],
        domains: ['job-room.ch', 'jobs.ch'],
        applyKeywords: ['bewerbung', 'candidature', 'candidatura', 'apply'],
    },

    // --- Generic localized HTML form discovery (language-wide) ---
];

/** Localized apply-form phrases for broad discovery (not site-scoped). */
export const FOREIGN_BROAD_QUERIES = [
    'bewerbungsformular html stellenangebot apply',
    'formulaire de candidature emploi html apply',
    'formulario de solicitud de empleo html apply',
    'modulo di candidatura lavoro html apply',
    'formularz aplikacyjny oferta pracy apply',
    'sollicitatieformulier vacature html apply',
    'форму заявления на работу html apply',
    '求人 応募 フォーム html apply',
    '지원서 양식 채용 apply html',
    '應徵 表單 履歷 html apply',
    'candidatura vaga formulário html apply',
    'ansökningsformulär jobb html apply',
    'ansøgningsskema job html apply',
    'søknadsskjema stilling html apply',
    'jelentkezési lap állás html apply',
    'αίτηση εργασίας φόρμα html apply',
    'başvuru formu iş ilanı html apply',
    'نموذج طلب توظيف apply html',
    'job application form hindi apply html',
    'online bewerbung formular name email telefon',
    'candidature en ligne formulaire nom email téléphone',
    'candidatura online formulario nombre email teléfono',
];

/**
 * @param {ForeignJobBoard} board
 * @returns {string[]}
 */
function queriesForBoard(board) {
    const queries = new Set(board.extraQueries || []);

    for (const domain of board.domains) {
        queries.add(`site:${domain} apply job application form`);
        queries.add(`site:${domain} ${board.applyKeywords[0]} ${board.applyKeywords[1] || 'apply'}`);

        if (board.applyKeywords.length > 2) {
            queries.add(`site:${domain} ${board.applyKeywords[2]}`);
        }
    }

    return [...queries];
}

/** @returns {string[]} */
export function buildForeignDiscoverQueries() {
    const queries = new Set(FOREIGN_BROAD_QUERIES);

    for (const board of FOREIGN_JOB_BOARDS) {
        for (const query of queriesForBoard(board)) {
            queries.add(query);
        }
    }

    return [...queries];
}

/** @returns {Array<{ url: string, title: string, description: string }>} */
export function buildForeignSeedUrls() {
    const seeds = [];

    for (const board of FOREIGN_JOB_BOARDS) {
        for (const seed of board.seeds || []) {
            seeds.push({
                ...seed,
                description: seed.description || `${board.name} (${board.region}) apply page`,
            });
        }
    }

    return seeds;
}

/** Hostname fragments for scrape prioritization (joined into RegExp in scrape.mjs). */
export const FOREIGN_HOST_FRAGMENTS = [
    ...new Set(FOREIGN_JOB_BOARDS.flatMap((board) => board.domains)),
];

/** Localized apply path fragments for scrape apply-only mode. */
export const FOREIGN_APPLY_PATH_FRAGMENTS = [
    'bewerbung',
    'bewerben',
    'candidature',
    'postuler',
    'candidatura',
    'candidatar',
    'inscribirse',
    'postular',
    'solliciteren',
    'sollicitatie',
    'aplikuj',
    'prihlasit',
    'jelentkez',
    'отклик',
    'откликнуться',
    'basvuru',
    'basvur',
    '応募',
    '지원',
    '應徵',
    '申请',
    '投递',
    'lamar',
    'สมัคร',
    'ứng-tuyển',
    'ansok',
    'ansök',
    'ansog',
    'ansøg',
    'søknad',
    'αίτηση',
    'מועמדות',
    'stellenbewerbung',
    'online-bewerbung',
    'formulaire-candidature',
    'formulario-solicitud',
];

/**
 * @param {string} pageUrl
 * @returns {string|null}
 */
export function inferForeignAtsStyleFromUrl(pageUrl) {
    const url = (pageUrl || '').toLowerCase();

    for (const board of FOREIGN_JOB_BOARDS) {
        if (board.domains.some((domain) => url.includes(domain))) {
            return board.id;
        }
    }

    return null;
}

/** Matrix discover queries for major foreign boards (subset for gap-filling). */
export const FOREIGN_ATS_DISCOVER_QUERIES = Object.fromEntries(
    FOREIGN_JOB_BOARDS
        .filter((board) => ['stepstone', 'infojobs_es', 'infojobs_br', 'pracuj', 'xing', 'hh', 'seek', 'jobstreet', 'gupy', 'welcometothejungle', 'jobteaser', 'naukri', 'saramin', 'wanted_kr', '104', 'doda', 'personio', 'indeed_de', 'indeed_fr', 'indeed_es', 'indeed_jp'].includes(board.id))
        .map((board) => [board.id, queriesForBoard(board)[0] || `site:${board.domains[0]} apply`]),
);

/** @returns {{ boards: number, queries: number, regions: string[], languages: string[] }} */
export function foreignBoardCatalogStats() {
    const regions = new Set(FOREIGN_JOB_BOARDS.map((board) => board.region));
    const languages = new Set(FOREIGN_JOB_BOARDS.flatMap((board) => board.languages));

    return {
        boards: FOREIGN_JOB_BOARDS.length,
        queries: buildForeignDiscoverQueries().length,
        regions: [...regions].sort(),
        languages: [...languages].sort(),
    };
}
