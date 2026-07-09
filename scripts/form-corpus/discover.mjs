#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { searchWeb } from './lib/firecrawl-client.mjs';
import { DISCOVERED_URLS_PATH } from './lib/paths.mjs';
import { SEED_URLS } from './lib/seed-urls.mjs';

const QUERIES = [
    'job application form html template apply',
    'employment application form html code example',
    'site:formspree.io application form html',
    'site:100forms.com employment application',
    'site:freecodecamp.org job application form',
    'site:github.io job application form html',
    'apply for job html form name email phone',
    'careers application form html demo',
    'workday application form example html',
    'greenhouse job application form fields html',
    'site:lever.co apply job application form',
    'site:boards.greenhouse.io application form',
    'site:myworkdayjobs.com apply form',
    'employment application form pdf html online',
    'site:jotform.com job application form template',
    'site:typeform.com job application',
    'site:forms.gle employment application',
    'site:smartsheet.com job application form template',
    'site:surveymonkey.com job application form',
    'internship application form html template',
    'volunteer application form html template',
    'site:codepen.io job application form',
    'site:glitch.me application form html',
    'generic job application form fields name email phone resume',
    'site:jobs.ashbyhq.com apply application form',
    'site:ashbyhq.com job application form',
    'site:bamboohr.com careers apply form',
    'site:jobs.smartrecruiters.com apply application',
    'site:icims.com careers apply form html',
    'site:taleo.net careersection apply',
    'site:indeed.com apply job application form',
    'site:linkedin.com jobs apply easy apply form demo',
    'site:boards.greenhouse.io apply',
    'site:jobs.lever.co apply',
    'site:myworkdayjobs.com en-US apply',
    'site:careers-page.com job application form',
    'site:apply.workable.com apply',
    'site:jobs.jobvite.com apply',
    'site:recruitee.com apply form',
    'site:teamtailor.com jobs apply',
    'site:personio.de jobs apply form',
    'site:successfactors.com career apply',
    'site:oraclecloud.com careers apply form',
    'site:find-treatment.service.gov.uk job application form',
    'site:gov.uk apply for job form',
    'site:civil-service-careers.gov.uk application form',
    'site:jobs.nhs.uk apply form',
    'site:charityjob.co.uk apply form',
    'site:totaljobs.com apply application form',
    'site:reed.co.uk apply job form',
    'site:glassdoor.com apply job form',
    'site:ziprecruiter.com apply form',
    'site:monster.com apply job application',
    'site:simplyhired.com apply form',
    'site:builtin.com jobs apply',
    'site:wellfound.com jobs apply',
    'site:angel.co jobs apply form',
    'site:remote.co remote jobs apply form',
    'site:weworkremotely.com apply form',
    'site:stackoverflow.com/jobs apply',
    'site:hire.trakstar.com apply',
    'site:paylocity.com Recruiting apply',
    'site:ukg.com careers apply form',
    'site:adp.com careers apply',
    'site:rippling.com jobs apply',
    'site:greenhouse.io embed job application',
    'site:lever.co embed job application form',
    'job application form site:github.com html demo',
    'employment application form site:netlify.app',
    'employment application form site:vercel.app demo',
    // ATS platforms - targeted apply-form discovery
    'site:jobs.ashbyhq.com apply application form',
    'site:jobs.ashbyhq.com/*/application',
    'site:ashbyhq.com careers apply form fields',
    'site:bamboohr.com/hiring/jobs apply application',
    'site:bamboohr.com careers job application form',
    'site:jobs.smartrecruiters.com apply form software',
    'site:jobs.smartrecruiters.com oneclick-ui application',
    'site:icims.com careers apply job application',
    'site:careers-*.icims.com/jobs apply',
    'site:apply.workable.com application form apply',
    'site:apply.workable.com/*/apply',
    'site:breezy.hr apply job application form',
    'site:breezy.hr/p apply',
    'site:recruitee.com/o apply application form',
    'site:recruitee.com/*/c/new apply',
    'site:teamtailor.com/jobs apply application',
    'site:*.teamtailor.com/jobs/*/applications/new',
    // UK public sector apply forms
    'site:civil-service-careers.gov.uk apply job application form',
    'site:civil-service-careers.gov.uk/job application apply',
    'site:findajob.dwp.gov.uk apply application form',
    'site:jobs.nhs.uk/candidate job application apply form',
    'site:jobs.nhs.uk apply vacancy application',
    // More Greenhouse + Lever listings with apply forms
    'site:boards.greenhouse.io jobs apply software engineer',
    'site:boards.greenhouse.io/*/jobs/*/apply',
    'site:boards.greenhouse.io job application form name email',
    'site:jobs.lever.co apply software engineer',
    'site:jobs.lever.co/*/apply application form',
    'site:jobs.eu.lever.co apply application form',
    // Static HTML employment form templates and demos
    'employment application form html template demo page',
    'job application form html css static example',
    'site:codepen.io employment application form html',
    'site:codepen.io job application form fields',
    'site:github.io employment application form html',
    'site:github.io job application form demo',
    'site:pages.dev job application form html',
    'site:netlify.app job application form html demo',
    'standard employment application form html template',
    'printable job application form html online fillable',
    'site:formbold.com job application form template',
    'site:aidaform.com job application form html',
    'site:forms.app job application form template',
    'site:formsite.com employment application form',
    'site:paperform.co job application form template',
    'site:cognitoforms.com job application form',
    'site:forms.office.com job application template',
    'site:forms.gle job application form',
    'site:docs.google.com/forms job application template',
    'site:wpforms.com job application form template',
    'site:gravityforms.com job application form',
    'site:hubspot.com job application form template',
    'site:elementor.com job application form template',
    'site:webflow.com job application form template',
    'site:framer.com job application form template',
    'site:softr.io job application form template',
    'site:fillout.com job application form template',
    'site:tally.so job application form template',
    'site:heyform.net job application form',
    'site:formcarry.com job application form html',
    'site:getform.io job application form html',
    'site:basin.com job application form html',
    'site:statically.io job application form html',
    'site:raw.githack.com job application form html',
    'site:raw.githubusercontent.com job application form html',
    // Additional ATS + UK public sector (round 2)
    'site:jobs.ashbyhq.com/*/application resume cover letter',
    'site:jobs.ashbyhq.com apply name email phone',
    'site:bamboohr.com/careers apply job application',
    'site:bamboohr.com/jobs/view apply form',
    'site:jobs.smartrecruiters.com oneclick-ui jobs apply',
    'site:jobs.smartrecruiters.com/*/apply',
    'site:apply.workable.com/*/apply name email',
    'site:recruitee.com/o/*/c/new application form',
    'site:recruitee.com apply vacancy form fields',
    'site:teamtailor.com/jobs/*/applications/new',
    'site:teamtailor.com apply job application form',
    'site:jobs.nhs.uk/candidate/job application apply',
    'site:jobs.nhs.uk/vacancy apply online form',
    'site:civil-service-careers.gov.uk/job/*/apply',
    'site:publicjobs.gov.scot apply application form',
    'site:findajob.dwp.gov.uk vacancy apply form',
    // More Greenhouse/Lever apply pages
    'site:boards.greenhouse.io/*/jobs/*/apply resume',
    'site:boards.eu.greenhouse.io apply application form',
    'site:job-boards.greenhouse.io apply form',
    'site:jobs.lever.co apply name email resume',
    'site:jobs.lever.co/*/apply equal employment',
    // Static HTML employment demos (hosted examples)
    'inurl:job-application inurl:form html template demo',
    'filetype:html "job application" "first name" "last name" email phone',
    'site:codepen.io/full employment application form',
    'site:jsfiddle.net job application form html',
    'site:stackblitz.com job application form html',
    'site:surge.sh job application form html',
    'site:fly.dev job application form html',
    'site:workers.dev job application form html',
    'site:form.io job application form template',
    'site:form.io/forms job application',
    'site:form.io/demo job application',
    'site:form.io/examples employment application',
    // Round 3: static employment forms (Firecrawl corpus expansion)
    'site:*.gov FormCenter employment application form',
    'inurl:FormCenter inurl:Employment-Application',
    'inurl:employment-application inurl:apply html form',
    'site:gravityforms.com job application form demo',
    'site:fluentforms.com job application form template',
    'site:ninjaforms.com employment application form',
    'site:formstack.com job application form template',
    'site:123formbuilder.com employment application form',
    'site:forms.hubspot.com job application',
    'site:embed.typeform.com job application',
    'site:forms.office.com employment application',
    'site:clickup.com forms job application template',
    'site:formassembly.com employment application form',
    'site:formsite.com employment application online form',
    'site:paperform.co job application form template',
    'site:cognitoforms.com employment application form',
    'site:feathery.io job application form template',
    'site:involve.me job application form template',
    'site:formcarry.com employment application form html',
    'site:getform.io job application form html',
    'site:basin.com job application form html',
    'employment application form site:pages.dev',
    'job application form site:web.app html',
];

const seen = new Set();
const discovered = [];

for (const seed of SEED_URLS) {
    if (!seed.url || seen.has(seed.url)) {
        continue;
    }

    seen.add(seed.url);
    discovered.push({
        url: seed.url,
        title: seed.title || '',
        description: seed.description || '',
        query: 'seed',
    });
}

let previousCount = 0;

if (existsSync(DISCOVERED_URLS_PATH)) {
    try {
        const previous = JSON.parse(readFileSync(DISCOVERED_URLS_PATH, 'utf8'));

        for (const row of previous.urls || []) {
            if (!row.url || seen.has(row.url)) {
                continue;
            }

            seen.add(row.url);
            discovered.push({ ...row, query: row.query || 'previous' });
        }

        previousCount = previous.urls?.length || 0;
    } catch {
        // ignore corrupt previous file
    }
}

console.log(`Loaded ${discovered.length} URLs from seeds + previous discoveries.`);

for (const query of QUERIES) {
    console.log(`Searching: ${query}`);

    try {
        const results = await searchWeb(query, 25);

        for (const row of results) {
            const url = row.url || row.link;

            if (!url || seen.has(url)) {
                continue;
            }

            seen.add(url);
            discovered.push({
                url,
                title: row.title || '',
                description: row.description || '',
                query,
            });
        }
    } catch (error) {
        console.error(`Search failed for "${query}": ${error.message}`);
    }
}

writeFileSync(DISCOVERED_URLS_PATH, `${JSON.stringify({ discovered_at: new Date().toISOString(), urls: discovered }, null, 2)}\n`);
console.log(`Discovered ${discovered.length} candidate URLs (${SEED_URLS.length} seeds, ${previousCount} previous, ${discovered.length - SEED_URLS.length - previousCount} from search) → ${DISCOVERED_URLS_PATH}`);
