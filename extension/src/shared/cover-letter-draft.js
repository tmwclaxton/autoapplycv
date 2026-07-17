function firstExperienceHighlight(role) {
    const highlights = Array.isArray(role?.highlights) ? role.highlights : [];

    for (const item of highlights) {
        const text = String(item || '').trim();

        if (text) {
            return text.replace(/[.!?]+$/, '');
        }
    }

    const technologies = Array.isArray(role?.technologies)
        ? role.technologies.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

    if (technologies.length > 0) {
        return `working with ${technologies.slice(0, 3).join(', ')}`;
    }

    return '';
}

/**
 * Offline / Auto Apply fallback when NanoGPT cover letter text is not provided.
 * Mirrors the Assist prompt structure: greeting, why-role, experience, fit, sign-off.
 */
export function buildDraftCoverLetterText(profileData, job = {}) {
    const profile = profileData?.profile || profileData || {};
    const name = String(profile.full_name || 'Applicant').trim();
    const headline = String(profile.headline || profile.title || '').trim();
    const summary = String(profile.summary || profile.bio || '').trim();
    const company = job?.company && job.company !== 'Unknown company' ? job.company : 'your organisation';
    const title = String(job?.title || 'this role').trim();
    const hiringManager = String(
        job?.hiring_manager || job?.contact_name || job?.recruiter_name || '',
    ).trim();
    const greeting = hiringManager ? `Dear ${hiringManager},` : 'Dear Hiring Manager,';
    const signOff = hiringManager ? 'Yours sincerely,' : 'Yours faithfully,';
    const roles = Array.isArray(profile.experience) ? profile.experience : [];
    const latestRole = roles.find((role) => role && (role.company || role.title)) || null;
    const roleTitle = String(latestRole?.title || '').trim();
    const employer = String(latestRole?.company || '').trim();
    const highlight = firstExperienceHighlight(latestRole);
    const summaryLine = summary
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)[0]
        ?.slice(0, 400) || '';

    const whyRole = company === 'your organisation'
        ? `I am applying for the ${title} because it matches the work I have been doing recently.`
        : `I am applying for the ${title} role at ${company} because it matches the work I have been doing recently.`;

    let experiencePara = '';

    if (roleTitle && employer) {
        if (highlight) {
            const detail = /^working with\b/i.test(highlight)
                ? highlight
                : `${highlight.charAt(0).toLowerCase()}${highlight.slice(1)}`;
            experiencePara = `As ${roleTitle} at ${employer}, I ${detail}. That experience maps directly to what this role needs.`;
        } else {
            experiencePara = `As ${roleTitle} at ${employer}, I have delivered work that maps directly to what this role needs.`;
        }
    } else if (summaryLine) {
        experiencePara = summaryLine.endsWith('.') ? summaryLine : `${summaryLine}.`;
    } else if (headline) {
        experiencePara = headline.endsWith('.') ? headline : `${headline}.`;
    } else {
        experiencePara = 'I bring hands-on delivery experience that I can put to work quickly in this role.';
    }

    const fitClose = company === 'your organisation'
        ? 'I would welcome a conversation about how my experience could help your team.'
        : `I would welcome a conversation about how my experience could help ${company}.`;

    return [
        greeting,
        '',
        whyRole,
        '',
        experiencePara,
        '',
        fitClose,
        '',
        signOff,
        name,
    ].filter((line, index, lines) => !(line === '' && lines[index - 1] === '')).join('\n');
}
