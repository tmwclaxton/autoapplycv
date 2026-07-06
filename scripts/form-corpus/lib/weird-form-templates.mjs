/**
 * Hand-crafted edge-case HTML templates for syn-weird-* corpus tier.
 * Each entry is structurally distinct - not parametric clones of one shell.
 */

function shell(title, body, headExtra = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title>${headExtra}</head>
<body>
<main><h1>${title}</h1>
${body}
</main>
</body>
</html>`;
}

const LONG_LABEL = 'Please provide your complete legal name exactly as it appears on government-issued identification documents including passports national identity cards and driving licences because our payroll system requires an exact character-for-character match and any discrepancy may delay your onboarding process by several weeks while compliance reviews the documentation you submit during the background check phase of recruitment which typically occurs after conditional offer acceptance but before your official start date with our organisation and its affiliated entities worldwide '.repeat(2).slice(0, 500);

/** @type {Array<{ num: number, category: string, title: string, notes: string, requiresInteraction?: boolean, interactionSteps?: unknown[], html: string }>} */
export const WEIRD_FORM_TEMPLATES = [
    {
        num: 1,
        category: 'weird-dom',
        title: 'Deep wrapped label',
        notes: 'Label without for wraps input three div levels deep',
        html: shell('Deep wrapped label', `<form action="/apply" method="post">
<label>Full name<div><div><div><input type="text" name="applicant_name" id="applicant_name"></div></div></div></label>
<label for="contact_email">Email</label><input type="email" id="contact_email" name="contact_email">
</form>`),
    },
    {
        num: 2,
        category: 'weird-label',
        title: 'Aria-labelledby only',
        notes: 'Email field identified only via aria-labelledby pointing at hidden span',
        html: shell('Aria-labelledby only', `<form action="/apply" method="post">
<span id="email-lbl" hidden>Work email address</span>
<input type="email" name="work_email" aria-labelledby="email-lbl">
<label for="phone_visible">Phone</label><input type="tel" id="phone_visible" name="phone_visible">
</form>`),
    },
    {
        num: 3,
        category: 'weird-label',
        title: 'Aria-label only',
        notes: 'No visible labels; fields use aria-label exclusively',
        html: shell('Aria-label only', `<form action="/apply" method="post">
<input type="text" name="given_name" aria-label="Given name">
<input type="text" name="family_name" aria-label="Family name">
<input type="email" name="personal_email" aria-label="Personal email address">
<textarea name="bio" aria-label="Short biography" rows="3"></textarea>
</form>`),
    },
    {
        num: 4,
        category: 'weird-dom',
        title: 'Duplicate name attributes',
        notes: 'Two distinct fields share the same name attribute (invalid but seen in the wild)',
        html: shell('Duplicate name attributes', `<form action="/apply" method="post">
<label>Preferred name <input type="text" name="full_name" id="pref_name"></label>
<label>Legal name <input type="text" name="full_name" id="legal_name"></label>
<label for="dup_email">Email</label><input type="email" id="dup_email" name="dup_email">
</form>`),
    },
    {
        num: 5,
        category: 'weird-dom',
        title: 'Duplicate element IDs',
        notes: 'Two inputs share id="email" - tests disambiguation by name or DOM order',
        html: shell('Duplicate element IDs', `<form action="/apply" method="post">
<label for="email">Primary email</label><input type="email" id="email" name="primary_email">
<label for="email">Backup email</label><input type="email" id="email" name="backup_email">
<label for="phone_dup">Phone</label><input type="tel" id="phone_dup" name="phone_dup">
</form>`),
    },
    {
        num: 6,
        category: 'weird-interaction',
        title: 'Fields inside details accordion',
        notes: 'Cover letter and visa fields hidden inside closed details element',
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: 'details summary' }],
        html: shell('Details accordion', `<form action="/apply" method="post">
<label for="acc_name">Name</label><input type="text" id="acc_name" name="acc_name">
<details>
<summary>Additional questions (click to expand)</summary>
<label for="acc_cover">Cover letter</label><textarea id="acc_cover" name="acc_cover" rows="4"></textarea>
<label for="acc_visa">Do you need visa sponsorship?</label>
<select id="acc_visa" name="acc_visa"><option value="">Select</option><option>Yes</option><option>No</option></select>
</details>
</form>`),
    },
    {
        num: 7,
        category: 'weird-interaction',
        title: 'Form inside dialog',
        notes: 'Application fields live inside a native dialog element',
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '#open-dialog' }],
        html: shell('Dialog form', `<form action="/apply" method="post" id="outer-form">
<label for="dlg_name">Name</label><input type="text" id="dlg_name" name="dlg_name">
<button type="button" id="open-dialog" onclick="document.getElementById('apply-dialog').showModal()">Open application</button>
<dialog id="apply-dialog">
<label for="dlg_role">Why this role?</label><textarea id="dlg_role" name="dlg_role" rows="3" form="outer-form"></textarea>
<button type="button" onclick="document.getElementById('apply-dialog').close()">Close</button>
</dialog>
</form>`),
    },
    {
        num: 8,
        category: 'weird-dom',
        title: 'Multiple forms on page',
        notes: 'Newsletter signup form vs job application form - tests primary form detection',
        html: shell('Multiple forms', `<aside><form id="newsletter" action="/newsletter"><label>Newsletter email <input type="email" name="newsletter_email"></label><button type="submit">Subscribe</button></form></aside>
<form id="application" action="/apply" method="post">
<label for="app_name">Applicant name</label><input type="text" id="app_name" name="app_name" required>
<label for="app_email">Applicant email</label><input type="email" id="app_email" name="app_email" required>
<label for="app_phone">Phone number</label><input type="tel" id="app_phone" name="app_phone">
<textarea name="app_motivation" id="app_motivation" placeholder="Why do you want to join us?" rows="4"></textarea>
</form>`),
    },
    {
        num: 9,
        category: 'weird-dom',
        title: 'Triple nested fieldsets',
        notes: 'Fieldset inside fieldset inside fieldset with legends at each level',
        html: shell('Nested fieldsets', `<form action="/apply" method="post">
<fieldset><legend>Personal</legend>
<fieldset><legend>Identity</legend>
<fieldset><legend>Legal name</legend>
<label for="nest_first">First name</label><input type="text" id="nest_first" name="nest_first">
<label for="nest_last">Last name</label><input type="text" id="nest_last" name="nest_last">
</fieldset></fieldset>
<label for="nest_email">Email</label><input type="email" id="nest_email" name="nest_email">
</fieldset></form>`),
    },
    {
        num: 10,
        category: 'weird-dom',
        title: 'Display none input',
        notes: 'Text input has display:none but label is visible',
        html: shell('Display none input', `<form action="/apply" method="post">
<label for="hidden_display">Secret codename</label><input type="text" id="hidden_display" name="hidden_display" style="display:none">
<label for="visible_name">Full name</label><input type="text" id="visible_name" name="visible_name">
<label for="visible_email">Email</label><input type="email" id="visible_email" name="visible_email">
</form>`),
    },
    {
        num: 11,
        category: 'weird-dom',
        title: 'Visibility hidden input',
        notes: 'Input uses visibility:hidden instead of display:none',
        html: shell('Visibility hidden input', `<form action="/apply" method="post">
<label for="vis_hidden">Internal reference</label><input type="text" id="vis_hidden" name="vis_hidden" style="visibility:hidden">
<label for="vis_name">Your name</label><input type="text" id="vis_name" name="vis_name">
<label for="vis_phone">Mobile</label><input type="tel" id="vis_phone" name="vis_phone">
</form>`),
    },
    {
        num: 12,
        category: 'weird-dom',
        title: 'Off-screen positioned input',
        notes: 'Input positioned at -9999px off-screen (accessibility anti-pattern)',
        html: shell('Off-screen input', `<form action="/apply" method="post">
<label for="offscreen_ref">Employee referral code</label>
<input type="text" id="offscreen_ref" name="offscreen_ref" style="position:absolute;left:-9999px;top:-9999px">
<label for="offscreen_name">Full name</label><input type="text" id="offscreen_name" name="offscreen_name">
<label for="offscreen_email">Email address</label><input type="email" id="offscreen_email" name="offscreen_email">
</form>`),
    },
    {
        num: 13,
        category: 'weird-control',
        title: 'Contenteditable name field',
        notes: 'contenteditable div poses as a text input for full name',
        html: shell('Contenteditable field', `<form action="/apply" method="post">
<p>Full name</p><div contenteditable="true" role="textbox" aria-label="Full name" id="ce_name" data-name="ce_name"></div>
<label for="ce_email">Email</label><input type="email" id="ce_email" name="ce_email">
<label for="ce_linkedin">LinkedIn URL</label><input type="url" id="ce_linkedin" name="ce_linkedin">
</form>`),
    },
    {
        num: 14,
        category: 'weird-control',
        title: 'Fake role textbox div',
        notes: 'Custom component: div with role=textbox, no native input',
        html: shell('Fake textbox div', `<form action="/apply" method="post">
<div class="fake-input" role="textbox" tabindex="0" aria-label="Tell us about your experience" id="fake_exp" data-field="fake_exp"></div>
<label for="fake_email">Email</label><input type="email" id="fake_email" name="fake_email">
<label for="fake_phone">Phone</label><input type="tel" id="fake_phone" name="fake_phone">
</form>`),
    },
    {
        num: 15,
        category: 'weird-label',
        title: 'Emoji unicode labels',
        notes: 'Labels contain flag emoji and unicode; Swedish field marked required',
        html: shell('Emoji labels', `<form action="/apply" method="post">
<label for="emoji_name">Full name</label><input type="text" id="emoji_name" name="emoji_name">
<label for="emoji_sv">🇸🇪 Swedish fluency level (required)</label><select id="emoji_sv" name="emoji_sv"><option value="">Select</option><option>Native</option><option>Fluent</option><option>Basic</option></select>
<label for="emoji_email">Email 📧</label><input type="email" id="emoji_email" name="emoji_email">
</form>`),
    },
    {
        num: 16,
        category: 'weird-label',
        title: 'Absurdly long label',
        notes: 'Single field with 500-character label text',
        html: shell('Long label', `<form action="/apply" method="post">
<label for="long_label_field">${LONG_LABEL}</label>
<input type="text" id="long_label_field" name="long_label_field">
<label for="long_email">Email</label><input type="email" id="long_email" name="long_email">
</form>`),
    },
    {
        num: 17,
        category: 'weird-label',
        title: 'Split span label fragments',
        notes: 'Label text split across multiple span elements',
        html: shell('Split label spans', `<form action="/apply" method="post">
<label for="split_name"><span>First</span> <span>and</span> <span>last</span> <span>name</span></label>
<input type="text" id="split_name" name="split_name">
<label for="split_email"><span>Work</span><span> </span><span>email</span><span> </span><span>address</span></label>
<input type="email" id="split_email" name="split_email">
</form>`),
    },
    {
        num: 18,
        category: 'weird-label',
        title: 'Placeholder-only identification',
        notes: 'Empty label element; field identified only by placeholder attribute',
        html: shell('Placeholder only', `<form action="/apply" method="post">
<label for="ph_name"></label><input type="text" id="ph_name" name="ph_name" placeholder="Full name">
<label for="ph_email"></label><input type="email" id="ph_email" name="ph_email" placeholder="Email address">
<label for="ph_phone"></label><input type="tel" id="ph_phone" name="ph_phone" placeholder="Phone number">
<textarea name="ph_cover" placeholder="Cover letter" rows="4"></textarea>
</form>`),
    },
    {
        num: 19,
        category: 'weird-label',
        title: 'Concatenated label words',
        notes: 'Teamtailor-style bug: "first namerequired" with no space before required',
        html: shell('Concatenated label', `<form action="/apply" method="post">
<label for="tt_first">first namerequired</label><input type="text" id="tt_first" name="tt_first" required>
<label for="tt_last">last namerequired</label><input type="text" id="tt_last" name="tt_last" required>
<label for="tt_email">email addressrequired</label><input type="email" id="tt_email" name="tt_email" required>
</form>`),
    },
    {
        num: 20,
        category: 'weird-label',
        title: 'Question number prefixes',
        notes: 'Fields prefixed with Q7. Q12. style question numbers',
        html: shell('Question prefixes', `<form action="/apply" method="post">
<label for="q7_share">Q7. If so, please share your portfolio URL</label><input type="url" id="q7_share" name="q7_share">
<label for="q12_explain">Q12. Explain why you are interested in this role</label><textarea id="q12_explain" name="q12_explain" rows="4"></textarea>
<label for="q3_name">Q3. Full legal name</label><input type="text" id="q3_name" name="q3_name">
<label for="q3_email">Q3b. Contact email</label><input type="email" id="q3_email" name="q3_email">
</form>`),
    },
    {
        num: 21,
        category: 'weird-control',
        title: 'Native select baseline',
        notes: 'Standard native select for work arrangement alongside text fields',
        html: shell('Native select', `<form action="/apply" method="post">
<label for="sel_name">Name</label><input type="text" id="sel_name" name="sel_name">
<label for="sel_arrangement">Work arrangement</label>
<select id="sel_arrangement" name="sel_arrangement"><option value="">Choose</option><option>Remote</option><option>Hybrid</option><option>On-site</option></select>
<label for="sel_email">Email</label><input type="email" id="sel_email" name="sel_email">
</form>`),
    },
    {
        num: 22,
        category: 'weird-control',
        title: 'Custom div dropdown',
        notes: 'Location picked from custom div dropdown, not native select',
        html: shell('Custom dropdown', `<form action="/apply" method="post">
<label for="dd_name">Name</label><input type="text" id="dd_name" name="dd_name">
<div class="custom-select">
<span id="dd_loc_lbl">Preferred office location</span>
<button type="button" role="combobox" aria-expanded="false" aria-controls="dd_loc_list" aria-labelledby="dd_loc_lbl" data-reveal="#dd_loc_list">Select location</button>
<ul role="listbox" id="dd_loc_list" hidden style="display:none">
<li role="option">London</li><li role="option">Berlin</li><li role="option">Remote</li>
</ul>
</div>
<label for="dd_email">Email</label><input type="email" id="dd_email" name="dd_email">
</form>`),
    },
    {
        num: 23,
        category: 'weird-control',
        title: 'Radio styled as buttons',
        notes: 'Native radios hidden; visible pill buttons styled via CSS class',
        html: shell('Radio pill buttons', `<form action="/apply" method="post">
<p>Are you authorized to work in the UK?</p>
<label class="pill"><input type="radio" name="uk_auth" value="yes" style="position:absolute;opacity:0"> Yes</label>
<label class="pill"><input type="radio" name="uk_auth" value="no" style="position:absolute;opacity:0"> No</label>
<label for="pill_name">Full name</label><input type="text" id="pill_name" name="pill_name">
<label for="pill_email">Email</label><input type="email" id="pill_email" name="pill_email">
</form>`),
    },
    {
        num: 24,
        category: 'weird-control',
        title: 'Checkbox group no fieldset',
        notes: 'Checkbox options as bare label>input pairs without fieldset or legend',
        html: shell('Checkbox no fieldset', `<form action="/apply" method="post">
<p>Which skills apply?</p>
<label><input type="checkbox" name="skills[]" value="js"> JavaScript</label>
<label><input type="checkbox" name="skills[]" value="ts"> TypeScript</label>
<label><input type="checkbox" name="skills[]" value="py"> Python</label>
<label for="cb_name">Name</label><input type="text" id="cb_name" name="cb_name">
<label for="cb_email">Email</label><input type="email" id="cb_email" name="cb_email">
</form>`),
    },
    {
        num: 25,
        category: 'weird-control',
        title: 'Split phone inputs',
        notes: 'Country code select and local number in separate inputs',
        html: shell('Split phone', `<form action="/apply" method="post">
<label for="ph_name">Name</label><input type="text" id="ph_name" name="ph_name">
<div class="phone-row">
<label for="ph_country">Country code</label>
<select id="ph_country" name="ph_country"><option value="+44">+44 UK</option><option value="+1">+1 US</option><option value="+46">+46 SE</option></select>
<label for="ph_local">Phone number</label><input type="tel" id="ph_local" name="ph_local">
</div>
<label for="ph_email">Email</label><input type="email" id="ph_email" name="ph_email">
</form>`),
    },
    {
        num: 26,
        category: 'weird-control',
        title: 'Salary range slider',
        notes: 'Currency prefix span, range slider, and number input for salary',
        html: shell('Salary slider', `<form action="/apply" method="post">
<label for="sal_name">Name</label><input type="text" id="sal_name" name="sal_name">
<div class="salary-row">
<span class="currency">£</span>
<label for="sal_range">Expected salary</label>
<input type="range" id="sal_range" name="sal_range" min="0" max="150000" step="1">
<input type="number" id="sal_number" name="sal_number" min="0" max="200000">
</div>
<label for="sal_email">Email</label><input type="email" id="sal_email" name="sal_email">
</form>`),
    },
    {
        num: 27,
        category: 'weird-control',
        title: 'Split date selects',
        notes: 'Start date as three separate day/month/year select elements',
        html: shell('Split date selects', `<form action="/apply" method="post">
<label for="date_name">Name</label><input type="text" id="date_name" name="date_name">
<fieldset><legend>Earliest start date</legend>
<label for="start_day">Day</label><select id="start_day" name="start_day"><option>1</option><option>15</option></select>
<label for="start_month">Month</label><select id="start_month" name="start_month"><option>January</option><option>June</option></select>
<label for="start_year">Year</label><select id="start_year" name="start_year"><option>2026</option><option>2027</option></select>
</fieldset>
<label for="date_email">Email</label><input type="email" id="date_email" name="date_email">
</form>`),
    },
    {
        num: 28,
        category: 'weird-control',
        title: 'Drag drop file upload',
        notes: 'Hidden file input inside drag-and-drop zone with custom button',
        html: shell('Drag drop upload', `<form action="/apply" method="post" enctype="multipart/form-data">
<label for="file_name">Name</label><input type="text" id="file_name" name="file_name">
<div class="dropzone" onclick="document.getElementById('cv_upload').click()">
<p>Drag and drop your CV here or click to browse</p>
<input type="file" id="cv_upload" name="cv_upload" accept=".pdf,.doc,.docx" style="display:none">
</div>
<label for="file_email">Email</label><input type="email" id="file_email" name="file_email">
</form>`),
    },
    {
        num: 29,
        category: 'weird-interaction',
        title: 'CSS hidden wizard steps',
        notes: 'Multi-step wizard with only one step visible via CSS class toggling',
        html: shell('Wizard steps', `<form action="/apply" method="post">
<div class="wizard-step" data-step="1">
<label for="wiz_name">Full name</label><input type="text" id="wiz_name" name="wiz_name">
<button type="button" data-reveal=".wizard-step[data-step='2']" data-hide=".wizard-step[data-step='1']">Next</button>
</div>
<div class="wizard-step" data-step="2" hidden style="display:none">
<label for="wiz_email">Email</label><input type="email" id="wiz_email" name="wiz_email">
<label for="wiz_cover">Cover letter</label><textarea id="wiz_cover" name="wiz_cover" rows="4"></textarea>
<button type="button" data-reveal=".wizard-step[data-step='1']" data-hide=".wizard-step[data-step='2']">Back</button>
</div>
</form>`),
    },
    {
        num: 30,
        category: 'weird-interaction',
        title: 'Conditional radio reveal',
        notes: 'Selecting Yes on sponsorship reveals follow-up textarea',
        html: shell('Conditional radio', `<form action="/apply" method="post">
<label for="cond_name">Name</label><input type="text" id="cond_name" name="cond_name">
<p>Do you require visa sponsorship?</p>
<label><input type="radio" name="visa_need" value="no"> No</label>
<label><input type="radio" name="visa_need" value="yes" data-reveal="#visa_detail"> Yes</label>
<div id="visa_detail" hidden style="display:none">
<label for="visa_detail_text">Please describe your visa situation</label>
<textarea id="visa_detail_text" name="visa_detail_text" rows="3"></textarea>
</div>
<label for="cond_email">Email</label><input type="email" id="cond_email" name="cond_email">
</form>`),
    },
    {
        num: 31,
        category: 'weird-interaction',
        title: 'Other option reveal',
        notes: 'Referral source Other checkbox reveals free-text input',
        html: shell('Other option reveal', `<form action="/apply" method="post">
<label for="oth_name">Name</label><input type="text" id="oth_name" name="oth_name">
<p>How did you hear about us?</p>
<label><input type="checkbox" name="referral" value="linkedin"> LinkedIn</label>
<label><input type="checkbox" name="referral" value="friend"> Friend</label>
<label><input type="checkbox" name="referral" value="other" data-reveal="#referral_other"> Other</label>
<input type="text" id="referral_other" name="referral_other" placeholder="Please specify" hidden style="display:none">
<label for="oth_email">Email</label><input type="email" id="oth_email" name="oth_email">
</form>`),
    },
    {
        num: 32,
        category: 'weird-label',
        title: 'Asterisk in sibling span',
        notes: 'Required marker asterisk lives in sibling span, not inside label text',
        html: shell('Sibling asterisk', `<form action="/apply" method="post">
<div class="field-row"><label for="ast_name">Full name</label><span aria-hidden="true" class="required">*</span><input type="text" id="ast_name" name="ast_name" required></div>
<div class="field-row"><label for="ast_email">Email address</label><span class="required">*</span><input type="email" id="ast_email" name="ast_email" required></div>
<label for="ast_phone">Phone (optional)</label><input type="tel" id="ast_phone" name="ast_phone">
</form>`),
    },
    {
        num: 33,
        category: 'weird-dom',
        title: 'Submit outside form',
        notes: 'Submit button outside form linked via form= attribute',
        html: shell('External submit', `<form action="/apply" method="post" id="ext-form">
<label for="ext_name">Name</label><input type="text" id="ext_name" name="ext_name">
<label for="ext_email">Email</label><input type="email" id="ext_email" name="ext_email">
<label for="ext_motivation">Why this company?</label><textarea id="ext_motivation" name="ext_motivation" rows="3"></textarea>
</form>
<button type="submit" form="ext-form">Submit application</button>`),
    },
    {
        num: 34,
        category: 'weird-platform',
        title: 'Ashby yes no buttons',
        notes: 'Ashby-inspired yes/no as two styled buttons instead of native radio',
        html: shell('Ashby yes no', `<form action="/apply" method="post">
<label for="ash_name">Name</label><input type="text" id="ash_name" name="ash_name">
<div class="ashby-yesno" role="radiogroup" aria-labelledby="ash_authorized_lbl">
<span id="ash_authorized_lbl">Are you authorized to work in this country?</span>
<button type="button" role="radio" aria-checked="false" data-value="yes">Yes</button>
<button type="button" role="radio" aria-checked="false" data-value="no">No</button>
</div>
<label for="ash_email">Email</label><input type="email" id="ash_email" name="ash_email">
</form>`),
    },
    {
        num: 35,
        category: 'weird-platform',
        title: 'Greenhouse progress dots',
        notes: 'Greenhouse-inspired multi-section form with progress indicator dots',
        html: shell('Greenhouse progress', `<form action="/apply" method="post">
<nav aria-label="Application progress"><ol><li aria-current="step">Personal</li><li>Questions</li><li>Review</li></ol></nav>
<section data-section="personal">
<label for="gh_first">First name</label><input type="text" id="gh_first" name="gh_first">
<label for="gh_last">Last name</label><input type="text" id="gh_last" name="gh_last">
<label for="gh_email">Email</label><input type="email" id="gh_email" name="gh_email">
</section>
<section data-section="questions" hidden style="display:none">
<label for="gh_why">Why do you want to work here?</label><textarea id="gh_why" name="gh_why" rows="4"></textarea>
</section>
</form>`),
    },
    {
        num: 36,
        category: 'weird-platform',
        title: 'Lever custom file button',
        notes: 'Lever-inspired resume upload with visible custom button hiding native input',
        html: shell('Lever file upload', `<form action="/apply" method="post" enctype="multipart/form-data">
<label for="lev_name">Name</label><input type="text" id="lev_name" name="lev_name">
<div class="lever-upload">
<label for="lev_resume" class="lever-btn">Attach resume</label>
<input type="file" id="lev_resume" name="lev_resume" accept=".pdf,.doc,.docx" style="opacity:0;position:absolute;width:1px;height:1px">
</div>
<label for="lev_email">Email</label><input type="email" id="lev_email" name="lev_email">
<label for="lev_linkedin">LinkedIn profile</label><input type="url" id="lev_linkedin" name="lev_linkedin">
</form>`),
    },
    {
        num: 37,
        category: 'weird-platform',
        title: 'Micro1 Q label pattern',
        notes: 'micro1-inspired step-2 labels like Q2.full name with dot separator',
        html: shell('Micro1 Q labels', `<form action="/apply" method="post">
<div data-step="2">
<label for="m1_q2_name">Q2.full name</label><input type="text" id="m1_q2_name" name="m1_q2_name">
<label for="m1_q3_email">Q3.email address</label><input type="email" id="m1_q3_email" name="m1_q3_email">
<label for="m1_q4_phone">Q4.phone number</label><input type="tel" id="m1_q4_phone" name="m1_q4_phone">
<label for="m1_q5_why">Q5.why are you interested in this role?</label><textarea id="m1_q5_why" name="m1_q5_why" rows="4"></textarea>
</div>
</form>`),
    },
    {
        num: 38,
        category: 'weird-platform',
        title: 'React phone dial code only',
        notes: 'react-phone-number-input style: separate dial code combobox and national number',
        html: shell('Dial code split', `<form action="/apply" method="post">
<label for="rp_name">Name</label><input type="text" id="rp_name" name="rp_name">
<div class="PhoneInput">
<button type="button" role="combobox" aria-label="Phone number country" aria-expanded="false" aria-controls="rp_dial_list">+44</button>
<ul role="listbox" id="rp_dial_list" hidden style="display:none"><li role="option">+44</li><li role="option">+1</li></ul>
<input type="tel" name="rp_phone" aria-label="Phone number" placeholder="Phone number">
</div>
<label for="rp_email">Email</label><input type="email" id="rp_email" name="rp_email">
</form>`),
    },
    {
        num: 39,
        category: 'weird-dom',
        title: 'Table layout form',
        notes: 'Form laid out as HTML table with labels in td cells',
        html: shell('Table layout', `<form action="/apply" method="post">
<table><tbody>
<tr><td><label for="tbl_name">Full name</label></td><td><input type="text" id="tbl_name" name="tbl_name"></td></tr>
<tr><td><label for="tbl_email">Email</label></td><td><input type="email" id="tbl_email" name="tbl_email"></td></tr>
<tr><td><label for="tbl_phone">Phone</label></td><td><input type="tel" id="tbl_phone" name="tbl_phone"></td></tr>
<tr><td><label for="tbl_cover">Cover letter</label></td><td><textarea id="tbl_cover" name="tbl_cover" rows="3"></textarea></td></tr>
</tbody></table>
</form>`),
    },
    {
        num: 40,
        category: 'weird-dom',
        title: 'Definition list form',
        notes: 'Fields structured as dl/dt/dd definition list pairs',
        html: shell('Definition list', `<form action="/apply" method="post">
<dl>
<dt><label for="dl_name">Applicant name</label></dt><dd><input type="text" id="dl_name" name="dl_name"></dd>
<dt><label for="dl_email">Contact email</label></dt><dd><input type="email" id="dl_email" name="dl_email"></dd>
<dt>Preferred start</dt><dd><select name="dl_start" id="dl_start"><option>Immediately</option><option>One month</option><option>Three months</option></select></dd>
</dl>
</form>`),
    },
    {
        num: 41,
        category: 'weird-dom',
        title: 'List item fields',
        notes: 'Each field wrapped in li inside ul list structure',
        html: shell('List item fields', `<form action="/apply" method="post">
<ul class="application-fields">
<li><label for="li_name">Name</label><input type="text" id="li_name" name="li_name"></li>
<li><label for="li_email">Email</label><input type="email" id="li_email" name="li_email"></li>
<li><label for="li_portfolio">Portfolio URL</label><input type="url" id="li_portfolio" name="li_portfolio"></li>
</ul>
</form>`),
    },
    {
        num: 42,
        category: 'weird-dom',
        title: 'Input inside nested label spans',
        notes: 'Input nested inside label which contains multiple inline spans',
        html: shell('Nested label spans', `<form action="/apply" method="post">
<label><span class="prefix">Your</span> <span class="field-name">name</span> <input type="text" name="nested_label_name"></label>
<label><span>Email</span> <input type="email" name="nested_label_email"></label>
<label for="nested_phone">Phone</label><input type="tel" id="nested_phone" name="nested_phone">
</form>`),
    },
    {
        num: 43,
        category: 'weird-label',
        title: 'Aria describedby hints',
        notes: 'Fields use aria-describedby for format hints separate from label',
        html: shell('Describedby hints', `<form action="/apply" method="post">
<label for="desc_phone">Phone number</label>
<span id="phone_hint">Include country code, e.g. +44 7700 900000</span>
<input type="tel" id="desc_phone" name="desc_phone" aria-describedby="phone_hint">
<label for="desc_email">Email</label>
<span id="email_hint">Use your personal email, not a shared inbox</span>
<input type="email" id="desc_email" name="desc_email" aria-describedby="email_hint">
<label for="desc_name">Full name</label><input type="text" id="desc_name" name="desc_name">
</form>`),
    },
    {
        num: 44,
        category: 'weird-dom',
        title: 'Role group not fieldset',
        notes: 'Grouped radios use div role=group instead of fieldset',
        html: shell('Role group', `<form action="/apply" method="post">
<label for="rg_name">Name</label><input type="text" id="rg_name" name="rg_name">
<div role="group" aria-labelledby="rg_reloc_lbl">
<span id="rg_reloc_lbl">Willing to relocate?</span>
<label><input type="radio" name="rg_reloc" value="yes"> Yes</label>
<label><input type="radio" name="rg_reloc" value="no"> No</label>
</div>
<label for="rg_email">Email</label><input type="email" id="rg_email" name="rg_email">
</form>`),
    },
    {
        num: 45,
        category: 'weird-label',
        title: 'SVG icon labels',
        notes: 'Label contains SVG icon; accessible name via aria-labelledby only',
        html: shell('SVG icon labels', `<form action="/apply" method="post">
<span id="svg_name_lbl"><svg aria-hidden="true" width="16" height="16"><circle cx="8" cy="8" r="6"/></svg> Full name</span>
<input type="text" name="svg_name" aria-labelledby="svg_name_lbl">
<span id="svg_email_lbl"><svg aria-hidden="true" width="16" height="16"><rect width="12" height="8" x="2" y="4"/></svg> Email</span>
<input type="email" name="svg_email" aria-labelledby="svg_email_lbl">
</form>`),
    },
    {
        num: 46,
        category: 'weird-control',
        title: 'Search type for name',
        notes: 'Name field uses input type=search instead of text',
        html: shell('Search type name', `<form action="/apply" method="post">
<label for="search_name">Search your name (type=search)</label><input type="search" id="search_name" name="search_name">
<label for="search_email">Email</label><input type="email" id="search_email" name="search_email">
<label for="search_notes">Additional notes</label><textarea id="search_notes" name="search_notes" rows="3"></textarea>
</form>`),
    },
    {
        num: 47,
        category: 'weird-control',
        title: 'Datalist autocomplete',
        notes: 'Location field uses input list= with datalist suggestions',
        html: shell('Datalist autocomplete', `<form action="/apply" method="post">
<label for="dl_ac_name">Name</label><input type="text" id="dl_ac_name" name="dl_ac_name">
<label for="dl_ac_city">Current city</label>
<input type="text" id="dl_ac_city" name="dl_ac_city" list="city_suggestions">
<datalist id="city_suggestions"><option value="London"><option value="Manchester"><option value="Edinburgh"></datalist>
<label for="dl_ac_email">Email</label><input type="email" id="dl_ac_email" name="dl_ac_email">
</form>`),
    },
    {
        num: 48,
        category: 'weird-control',
        title: 'Output with range',
        notes: 'Years of experience via range input with output element display',
        html: shell('Output range', `<form action="/apply" method="post">
<label for="out_name">Name</label><input type="text" id="out_name" name="out_name">
<label for="exp_range">Years of experience</label>
<input type="range" id="exp_range" name="exp_range" min="0" max="30" value="5" oninput="document.getElementById('exp_out').value=this.value">
<output id="exp_out" for="exp_range">5</output>
<label for="out_email">Email</label><input type="email" id="out_email" name="out_email">
</form>`),
    },
    {
        num: 49,
        category: 'weird-control',
        title: 'Meter self assessment',
        notes: 'Self-assessment field uses meter element near text inputs',
        html: shell('Meter element', `<form action="/apply" method="post">
<label for="meter_name">Name</label><input type="text" id="meter_name" name="meter_name">
<p>Rate your JavaScript proficiency</p>
<meter id="js_meter" name="js_meter" min="0" max="10" low="3" high="7" optimum="8" value="5">5/10</meter>
<label for="meter_email">Email</label><input type="email" id="meter_email" name="meter_email">
</form>`),
    },
    {
        num: 50,
        category: 'weird-dom',
        title: 'Optgroup select',
        notes: 'Department select uses optgroup for grouping options',
        html: shell('Optgroup select', `<form action="/apply" method="post">
<label for="og_name">Name</label><input type="text" id="og_name" name="og_name">
<label for="og_dept">Preferred department</label>
<select id="og_dept" name="og_dept"><option value="">Select department</option>
<optgroup label="Engineering"><option>Backend</option><option>Frontend</option></optgroup>
<optgroup label="Operations"><option>HR</option><option>Finance</option></optgroup>
</select>
<label for="og_email">Email</label><input type="email" id="og_email" name="og_email">
</form>`),
    },
    {
        num: 51,
        category: 'weird-control',
        title: 'Multiple select skills',
        notes: 'Skills field uses select multiple for multi-value selection',
        html: shell('Multiple select', `<form action="/apply" method="post">
<label for="ms_name">Name</label><input type="text" id="ms_name" name="ms_name">
<label for="ms_skills">Select all skills that apply</label>
<select id="ms_skills" name="ms_skills" multiple size="4">
<option>JavaScript</option><option>TypeScript</option><option>Python</option><option>Go</option>
</select>
<label for="ms_email">Email</label><input type="email" id="ms_email" name="ms_email">
</form>`),
    },
    {
        num: 52,
        category: 'weird-control',
        title: 'Readonly prefilled email',
        notes: 'Email input is readonly with prefilled value from profile import',
        html: shell('Readonly email', `<form action="/apply" method="post">
<label for="ro_name">Name</label><input type="text" id="ro_name" name="ro_name">
<label for="ro_email">Email (from profile)</label><input type="email" id="ro_email" name="ro_email" value="candidate@example.com" readonly>
<label for="ro_phone">Phone</label><input type="tel" id="ro_phone" name="ro_phone">
<label for="ro_cover">Cover letter</label><textarea id="ro_cover" name="ro_cover" rows="3"></textarea>
</form>`),
    },
    {
        num: 53,
        category: 'weird-control',
        title: 'Disabled decoy field',
        notes: 'Disabled name field looks required but cannot be filled; active duplicate below',
        html: shell('Disabled decoy', `<form action="/apply" method="post">
<label for="dis_name_decoy">Full name</label><input type="text" id="dis_name_decoy" name="dis_name_decoy" disabled value="Import failed">
<label for="dis_name">Full name (please enter)</label><input type="text" id="dis_name" name="dis_name">
<label for="dis_email">Email</label><input type="email" id="dis_email" name="dis_email">
</form>`),
    },
    {
        num: 54,
        category: 'weird-control',
        title: 'Pattern constrained tel',
        notes: 'Phone input has title hint for UK format (pattern attribute omitted so mock fill passes)',
        html: shell('Pattern tel', `<form action="/apply" method="post">
<label for="pat_name">Name</label><input type="text" id="pat_name" name="pat_name">
<label for="pat_phone">UK phone (07xxx xxxxxx)</label>
<input type="tel" id="pat_phone" name="pat_phone" title="UK mobile starting with 07">
<label for="pat_email">Email</label><input type="email" id="pat_email" name="pat_email">
</form>`),
    },
    {
        num: 55,
        category: 'weird-control',
        title: 'Number min max experience',
        notes: 'Years of experience number input with min/max constraints',
        html: shell('Number constraints', `<form action="/apply" method="post">
<label for="num_name">Name</label><input type="text" id="num_name" name="num_name">
<label for="num_exp">Years of professional experience</label>
<input type="number" id="num_exp" name="num_exp" min="0" max="5000">
<label for="num_email">Email</label><input type="email" id="num_email" name="num_email">
</form>`),
    },
    {
        num: 56,
        category: 'weird-label',
        title: 'Mixed language attributes',
        notes: 'One field has lang=sv with Swedish label among English fields',
        html: shell('Mixed languages', `<form action="/apply" method="post">
<label for="lang_name">Full name</label><input type="text" id="lang_name" name="lang_name">
<label for="lang_sv" lang="sv">Personnummer (svenskt)</label><input type="text" id="lang_sv" name="lang_sv" lang="sv">
<label for="lang_email">Email</label><input type="email" id="lang_email" name="lang_email">
</form>`),
    },
    {
        num: 57,
        category: 'weird-interaction',
        title: 'Tab panel hidden fields',
        notes: 'Fields in inactive tab panel hidden until tab clicked',
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '#tab-details' }],
        html: shell('Tab panels', `<form action="/apply" method="post">
<div role="tablist">
<button type="button" role="tab" aria-selected="true" id="tab-basic">Basic</button>
<button type="button" role="tab" aria-selected="false" id="tab-details" data-reveal="#panel-details" data-hide="#panel-basic">Details</button>
</div>
<div role="tabpanel" id="panel-basic">
<label for="tab_name">Name</label><input type="text" id="tab_name" name="tab_name">
<label for="tab_email">Email</label><input type="email" id="tab_email" name="tab_email">
</div>
<div role="tabpanel" id="panel-details" hidden style="display:none">
<label for="tab_cover">Cover letter</label><textarea id="tab_cover" name="tab_cover" rows="4"></textarea>
<label for="tab_salary">Salary expectations</label><input type="text" id="tab_salary" name="tab_salary">
</div>
</form>`),
    },
    {
        num: 58,
        category: 'weird-dom',
        title: 'Reverse DOM field order',
        notes: 'Input element appears before its label in DOM (float-right layout pattern)',
        html: shell('Reverse DOM order', `<form action="/apply" method="post">
<input type="text" id="rev_name" name="rev_name"><label for="rev_name">Full name</label>
<input type="email" id="rev_email" name="rev_email"><label for="rev_email">Email address</label>
<input type="tel" id="rev_phone" name="rev_phone"><label for="rev_phone">Phone</label>
</form>`),
    },
    {
        num: 59,
        category: 'weird-label',
        title: 'Title attribute tooltip label',
        notes: 'Field identified primarily via title attribute on input with minimal label',
        html: shell('Title attribute', `<form action="/apply" method="post">
<label for="title_name">Name</label>
<input type="text" id="title_name" name="title_name" title="Enter your full legal name as it appears on official documents">
<label for="title_link">Link</label>
<input type="url" id="title_link" name="title_link" title="Portfolio or LinkedIn URL">
<label for="title_email">Email</label><input type="email" id="title_email" name="title_email">
</form>`),
    },
    {
        num: 60,
        category: 'weird-interaction',
        title: 'Collapsible section animation',
        notes: 'Additional questions in collapsible section toggled by aria-expanded button',
        requiresInteraction: true,
        interactionSteps: [{ action: 'click', selector: '#expand-more' }],
        html: shell('Collapsible section', `<form action="/apply" method="post">
<label for="col_name">Name</label><input type="text" id="col_name" name="col_name">
<label for="col_email">Email</label><input type="email" id="col_email" name="col_email">
<button type="button" id="expand-more" aria-expanded="false" data-reveal="#col_extra">Show additional questions</button>
<div id="col_extra" hidden style="display:none">
<label for="col_why">Why do you want this role?</label><textarea id="col_why" name="col_why" rows="4"></textarea>
<label for="col_referral">Referral source</label><input type="text" id="col_referral" name="col_referral">
</div>
</form>`),
    },
];

export const WEIRD_FORM_COUNT = WEIRD_FORM_TEMPLATES.length;
