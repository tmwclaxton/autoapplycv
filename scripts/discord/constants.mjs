/** @see https://discord.com/developers/applications/1523097041209921706 */
export const DISCORD_APPLICATION_ID = '1523097041209921706';

/** View/Send/Manage/Pin Messages, Manage Channels & Roles, Read History, Create Invite */
export const BOT_PERMISSIONS = '2251800082213905';

export const BOT_INVITE_URL =
    `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_APPLICATION_ID}`
    + `&permissions=${BOT_PERMISSIONS}&scope=bot%20applications.commands`;

export const PORTAL = {
    name: 'AutoCVApply',
    description:
        'Official AutoCVApply community bot. Get extension help, ATS tips, and product updates. '
        + 'Upload your CV once, autofill job forms on Greenhouse, Ashby, Workday & more - you review every field.',
    tags: ['Productivity', 'Career', 'Chrome Extension', 'Job Search', 'AI Tools'],
    termsUrl: 'https://autocvapply.com/terms',
    privacyUrl: 'https://autocvapply.com/privacy',
};
