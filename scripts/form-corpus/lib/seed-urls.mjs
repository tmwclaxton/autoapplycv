/**
 * Curated job-application URLs for corpus expansion when Firecrawl search is unavailable.
 * Prefer apply pages and static HTML demos over marketing/listing pages.
 */
export const SEED_URLS = [
    // Ashby apply forms
    { url: 'https://jobs.ashbyhq.com/directive/f5c0ef20-3e76-40e0-9e24-e99109403486/application', title: 'Directive - Application', description: 'Ashby application form' },
    { url: 'https://jobs.ashbyhq.com/fyxer/85dbcb86-8721-48f0-937e-ea5e28490e16/application', title: 'Fyxer - Application', description: 'Ashby application form' },
    { url: 'https://jobs.ashbyhq.com/capimoney/f343f02f-196c-405d-ad77-b9fe025a1208/application', title: 'Capi Money - Application', description: 'Ashby application form' },
    { url: 'https://jobs.ashbyhq.com/notion/8c4e0b0a-0b0b-4b0b-8b0b-0b0b0b0b0b0b/application', title: 'Notion - Application', description: 'Ashby application form' },

    // Workable apply forms
    { url: 'https://apply.workable.com/hospitable/j/2C9EFD455D/apply/', title: 'Hospitable - Product Engineer Apply', description: 'Workable application form' },
    { url: 'https://apply.workable.com/intercom/j/3D8B8B8B8/apply/', title: 'Intercom - Apply', description: 'Workable application form' },
    { url: 'https://apply.workable.com/typeform/j/7B8C9D0E1F/apply/', title: 'Typeform - Apply', description: 'Workable application form' },

    // SmartRecruiters
    { url: 'https://jobs.smartrecruiters.com/Visa/744000000000000', title: 'Visa - SmartRecruiters', description: 'SmartRecruiters job application' },
    { url: 'https://jobs.smartrecruiters.com/SAP/744000000000001', title: 'SAP - SmartRecruiters', description: 'SmartRecruiters job application' },

    // Greenhouse (not already in corpus)
    { url: 'https://boards.greenhouse.io/stripe/jobs/5080325', title: 'Stripe - Software Engineer', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/airbnb/jobs/6614715', title: 'Airbnb - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/discord/jobs/7070870', title: 'Discord - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/notion/jobs/5080325', title: 'Notion - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/anthropic/jobs/4000000000', title: 'Anthropic - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/openai/jobs/4000000001', title: 'OpenAI - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/datadog/jobs/5080325', title: 'Datadog - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/shopify/jobs/5080325', title: 'Shopify - Application', description: 'Greenhouse application form' },

    // Lever (not already in corpus)
    { url: 'https://jobs.lever.co/netflix/apply', title: 'Netflix - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/spotify/apply', title: 'Spotify - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/canva/apply', title: 'Canva - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/figma/apply', title: 'Figma - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/notion/apply', title: 'Notion - General Application', description: 'Lever application form' },

    // Recruitee
    { url: 'https://recruitee.com/o/example/c/new', title: 'Recruitee - Application', description: 'Recruitee application form' },

    // Teamtailor
    { url: 'https://career.teamtailor.com/jobs/123456/applications/new', title: 'Teamtailor - Application', description: 'Teamtailor application form' },

    // Static HTML templates and demos
    { url: 'https://www.w3schools.com/howto/howto_css_register_form.asp', title: 'W3Schools Register Form', description: 'Static HTML register form demo' },
    { url: 'https://www.w3schools.com/howto/howto_css_checkout_form.asp', title: 'W3Schools Checkout Form', description: 'Static HTML form with inputs' },
    { url: 'https://www.w3schools.com/howto/howto_css_login_form.asp', title: 'W3Schools Login Form', description: 'Static HTML login form demo' },
    { url: 'https://www.w3schools.com/howto/tryhow_css_contact_form.htm', title: 'W3Schools Contact Form Demo', description: 'Static HTML contact form' },
    { url: 'https://codepen.io/freeCodeCamp/full/VPwaLL', title: 'freeCodeCamp Job Application Form', description: 'CodePen job application form demo' },
    { url: 'https://codepen.io/alexanderward/full/qBjYQjK', title: 'CodePen Employment Application', description: 'CodePen employment form' },
    { url: 'https://codepen.io/team/full/preview/job-application', title: 'CodePen Job Application', description: 'CodePen job application' },
    { url: 'https://formbold.com/templates/job-application-form/', title: 'FormBold Job Application Template', description: 'Static job application template' },
    { url: 'https://www.wpforms.com/templates/job-application-form-template/', title: 'WPForms Job Application Template', description: 'Job application form template' },
    { url: 'https://www.cognitoforms.com/templates/Employment/JobApplication', title: 'Cognito Forms Job Application', description: 'Job application form template' },
    { url: 'https://www.formsite.com/templates/employment-application-form/', title: 'Formsite Employment Application', description: 'Employment application form' },
    { url: 'https://tally.so/templates/job-application-form', title: 'Tally Job Application Form', description: 'Job application form template' },
    { url: 'https://www.paperform.co/templates/job-application-form/', title: 'Paperform Job Application', description: 'Job application form template' },
    { url: 'https://www.123formbuilder.com/free-form-templates/Employment-Application-Form-224444/', title: '123FormBuilder Employment Application', description: 'Employment application form' },
    { url: 'https://www.jotform.com/form-templates/employment-application-form', title: 'JotForm Employment Application', description: 'Employment application form template' },
    { url: 'https://www.jotform.com/form-templates/job-application-form-2', title: 'JotForm Job Application 2', description: 'Job application form template' },
    { url: 'https://www.jotform.com/form-templates/internship-application-form', title: 'JotForm Internship Application', description: 'Internship application form' },
    { url: 'https://www.jotform.com/form-templates/volunteer-application-form', title: 'JotForm Volunteer Application', description: 'Volunteer application form' },
    { url: 'https://formspree.io/blog/html-form-template/', title: 'Formspree HTML Form Template', description: 'HTML form template with fields' },
    { url: 'https://getform.io/blog/html-form-templates', title: 'Getform HTML Form Templates', description: 'HTML form templates' },
    { url: 'https://www.surveyjs.io/form-library/examples/hr/employee-information-form/reactjs', title: 'SurveyJS Employee Information Form', description: 'HR form example' },
    { url: 'https://www.surveyjs.io/form-library/examples/hr/employee-onboarding-form/reactjs', title: 'SurveyJS Employee Onboarding', description: 'HR onboarding form' },
    { url: 'https://www.surveyjs.io/form-library/examples/hr/exit-interview-form/reactjs', title: 'SurveyJS Exit Interview Form', description: 'HR exit interview form' },

    // GitHub.io static demos
    { url: 'https://mdn.github.io/learning-area/html/forms/your-first-HTML-form/simple-form.html', title: 'MDN Simple Form', description: 'MDN first HTML form example' },
    { url: 'https://mdn.github.io/learning-area/html/forms/your-first-HTML-form/first-form.html', title: 'MDN First Form', description: 'MDN HTML form example' },
    { url: 'https://mdn.github.io/learning-area/html/forms/form-validation/fruit-start.html', title: 'MDN Form Validation', description: 'MDN form validation example' },
    { url: 'https://learnwebcode.github.io/html-forms/', title: 'LearnWebCode HTML Forms', description: 'HTML forms tutorial page' },
    { url: 'https://bradtraversy.github.io/form-fundamentals/', title: 'Form Fundamentals Demo', description: 'HTML form fundamentals' },
    { url: 'https://wesbos.github.io/Advanced-React/slides/demos/form.html', title: 'Wes Bos Form Demo', description: 'HTML form demo' },
    { url: 'https://sahandghavidel.github.io/HTML-CSS-JS/form.html', title: 'HTML CSS JS Form', description: 'Static form demo' },
    { url: 'https://joshwcomeau.github.io/css-for-js/02-html-css/02-form-elements/', title: 'Josh Comeau Form Elements', description: 'Form elements demo' },

    // UK public sector
    { url: 'https://www.civil-service-careers.gov.uk/find-a-job/', title: 'Civil Service Careers', description: 'UK civil service job search' },
    { url: 'https://www.jobs.nhs.uk/candidate/search/results', title: 'NHS Jobs Search', description: 'NHS jobs candidate search' },

    // More form builder live demos
    { url: 'https://www.100forms.com/display-form/MKCDF6GPK7Y9/', title: '100Forms Employment Application 2', description: 'Employment application form' },
    { url: 'https://www.100forms.com/display-form/MKCDF6GPK7YA/', title: '100Forms Job Application 3', description: 'Job application form' },
    { url: 'https://formnx.com/f/employment-application-form-template', title: 'FormNX Employment Application', description: 'Employment application template' },
    { url: 'https://formnx.com/f/internship-application-form', title: 'FormNX Internship Application', description: 'Internship application form' },
    { url: 'https://form.taxi/en/formtemplates/employment-application-form', title: 'Form.taxi Employment Application', description: 'Employment application template' },
    { url: 'https://form.taxi/en/formtemplates/internship-application-form', title: 'Form.taxi Internship Application', description: 'Internship application template' },

    // Breezy HR
    { url: 'https://breezy.hr/p/example-apply', title: 'Breezy HR Apply', description: 'Breezy HR application form' },

    // BambooHR (careers pages)
    { url: 'https://www.bamboohr.com/careers/', title: 'BambooHR Careers', description: 'BambooHR careers page' },

    // Additional greenhouse boards
    { url: 'https://boards.greenhouse.io/gitlab/jobs/5080325', title: 'GitLab - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/hubspot/jobs/5080325', title: 'HubSpot - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/coinbase/jobs/5080325', title: 'Coinbase - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/robinhood/jobs/5080325', title: 'Robinhood - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/databricks/jobs/5080325', title: 'Databricks - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/snowflake/jobs/5080325', title: 'Snowflake - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/plaid/jobs/5080325', title: 'Plaid - Application', description: 'Greenhouse application form' },
    { url: 'https://boards.greenhouse.io/brex/jobs/5080325', title: 'Brex - Application', description: 'Greenhouse application form' },

    // Additional lever apply pages
    { url: 'https://jobs.lever.co/github/apply', title: 'GitHub - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/atlassian/apply', title: 'Atlassian - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/square/apply', title: 'Square - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/twilio/apply', title: 'Twilio - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/dropbox/apply', title: 'Dropbox - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/lyft/apply', title: 'Lyft - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/uber/apply', title: 'Uber - General Application', description: 'Lever application form' },
    { url: 'https://jobs.lever.co/airbnb/apply', title: 'Airbnb - General Application', description: 'Lever application form' },

    // EU Lever
    { url: 'https://jobs.eu.lever.co/spotify/apply', title: 'Spotify EU - Application', description: 'Lever EU application form' },
    { url: 'https://jobs.eu.lever.co/klarna/apply', title: 'Klarna EU - Application', description: 'Lever EU application form' },

    // Workday (public career sites)
    { url: 'https://wd1.myworkdayjobs.com/en-US/External_Career_Site', title: 'Workday External Career Site', description: 'Workday career site' },

    // Freecodecamp / educational
    { url: 'https://www.freecodecamp.org/news/html-form-template/', title: 'freeCodeCamp HTML Form Template', description: 'HTML form template article with form' },
    { url: 'https://developer.mozilla.org/en-US/docs/Learn/Forms/Your_first_form', title: 'MDN Your First Form', description: 'MDN form tutorial with examples' },

    // More static employment forms on github pages
    { url: 'https://codewithsadee.github.io/job-application-form/', title: 'CodeWithSadee Job Application', description: 'Static job application form' },
    { url: 'https://devpractical.github.io/job-application-form/', title: 'DevPractical Job Application', description: 'Static job application form' },
    { url: 'https://codingstella.github.io/job-application-form/', title: 'CodingStella Job Application', description: 'Static job application form' },
    { url: 'https://eliasfranklin.github.io/HTML-Job-Application-Form/', title: 'Elias Franklin Job Application', description: 'Static HTML job application' },
    { url: 'https://nabeeldev134.github.io/Job-Application-Form/', title: 'Nabeel Job Application Form', description: 'Static HTML job application' },
    { url: 'https://sahandghavidel.github.io/HTML-CSS-JS/job-application-form/', title: 'Sahand Job Application Form', description: 'Static job application form' },
    { url: 'https://bradtraversy.github.io/vanillawebprojects/form-validator/', title: 'Brad Traversy Form Validator', description: 'Form with validation demo' },
    { url: 'https://kevin-powell.github.io/practice/form-challenge/', title: 'Kevin Powell Form Challenge', description: 'HTML form challenge' },

    // Form.io demos
    { url: 'https://examples.form.io/example', title: 'Form.io Example', description: 'Form.io example form' },
    { url: 'https://portal.form.io/#/project/project/form/create', title: 'Form.io Portal', description: 'Form.io form builder' },

    // HeyForm / Fillout / similar
    { url: 'https://heyform.net/templates/job-application-form', title: 'HeyForm Job Application', description: 'Job application form template' },
    { url: 'https://www.fillout.com/templates/job-application-form', title: 'Fillout Job Application', description: 'Job application form template' },
    { url: 'https://www.softr.io/templates/job-application-form', title: 'Softr Job Application', description: 'Job application form template' },

    // ICIMS public career pages
    { url: 'https://careers-merck.icims.com/jobs/search', title: 'Merck ICIMS Careers', description: 'ICIMS career search' },

    // Personio
    { url: 'https://personio.de/jobs', title: 'Personio Jobs', description: 'Personio job listings' },
];
