#!/usr/bin/env node
import { BOT_INVITE_URL, DISCORD_APPLICATION_ID, PORTAL } from './constants.mjs';
import { loadEnv } from './load-env.mjs';

loadEnv();

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) {
    console.error('Missing DISCORD_BOT_TOKEN in .env');
    process.exit(1);
}

const api = async (method, path, body) => {
    const response = await fetch(`https://discord.com/api/v10${path}`, {
        method,
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data = null;

    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    if (!response.ok) {
        const detail = typeof data === 'object' ? JSON.stringify(data) : text;

        if (response.status === 404 && path.startsWith('/guilds/')) {
            throw new Error(
                `${method} ${path} → ${response.status}: Bot is not in this server, or the guild ID is wrong. `
                + `Invite the bot first:\n  ${BOT_INVITE_URL}`,
            );
        }

        throw new Error(`${method} ${path} → ${response.status}: ${detail}`);
    }

    return data;
};

const SERVER_LAYOUT = [
    {
        category: 'Start here',
        channels: [
            {
                name: 'welcome',
                topic: 'Start here — read #rules, then say hello in #general.',
                readonly: true,
            },
            {
                name: 'rules',
                topic: 'Community guidelines for AutoCVApply.',
                readonly: true,
            },
        ],
    },
    {
        category: 'Community',
        channels: [
            {
                name: 'announcements',
                topic: 'Product updates from the AutoCVApply team.',
                readonly: true,
                teamPost: true,
            },
            {
                name: 'updates',
                topic: 'Automated feed of commits pushed to main on GitHub.',
                readonly: true,
                teamPost: true,
            },
            {
                name: 'general',
                topic: 'Chat about job hunting, extensions, and anything career-related.',
            },
        ],
    },
    {
        category: 'AutoCVApply',
        channels: [
            {
                name: 'extension-help',
                topic: 'Chrome extension setup, connection JSON, autofill & Draft All troubleshooting.',
            },
            {
                name: 'ats-tips',
                topic: 'Greenhouse, Ashby, Workday, Lever, and other ATS quirks.',
            },
            {
                name: 'feature-requests',
                topic: 'Ideas for AutoCVApply — one thread per idea please.',
            },
            {
                name: 'showcase',
                topic: 'Share wins — forms filled faster, offers landed, clever workflows.',
            },
        ],
    },
];

const ROLES = [
    { name: 'Team', color: 0xc8102e, hoist: true },
    { name: 'Member', color: 0x5865f2, hoist: false },
];

const WELCOME_MESSAGE = [
    '📮 **Welcome to AutoCVApply**',
    '',
    'You found the community for people who\'d rather **apply to jobs** than retype their CV for the forty-seventh time.',
    '',
    '**What we do**',
    'Upload your CV once → structured profile → Chrome extension autofill on real ATS forms (Greenhouse, Ashby, Workday, Lever, and more). **Draft All** drafts cover letters and awkward textareas. *You* review every field and click Submit — **we never auto-apply.**',
    '',
    '**Get started**',
    '• [Sign up free →](https://autocvapply.com)',
    '• [How it works](https://autocvapply.com/how-to)',
    '• [Source on GitHub](https://github.com/tmwclaxton/autoapplycv)',
    '',
    '**Where to go next**',
    '→ Read **#rules**',
    '→ Introduce yourself in **#general**',
    '→ Extension trouble? **#extension-help**',
].join('\n');

const RULES_MESSAGE = [
    '📋 **Community rules**',
    '',
    'Keep this a useful place for job hunters and contributors.',
    '',
    '**1 · Be decent** — job hunting is hard enough; help each other out.',
    '**2 · No spam** — no unsolicited DMs, referral farming, or drive-by self-promo.',
    '**3 · Protect your account** — never post API tokens, connection JSON, or passwords in public channels.',
    '**4 · Stay honest** — AutoCVApply helps you present *your* experience; don\'t invent qualifications.',
    '**5 · Right channel, right question** — `#extension-help` for bugs · `#feature-requests` for ideas · `#ats-tips` for platform quirks',
    '',
    `[Terms of service](${PORTAL.termsUrl}) · [Privacy policy](${PORTAL.privacyUrl})`,
].join('\n');

const CHANNEL_PIN_MESSAGES = {
    welcome: WELCOME_MESSAGE,
    rules: RULES_MESSAGE,
    announcements: [
        '📣 **Announcements**',
        '',
        'Official product news from the AutoCVApply team — releases, maintenance windows, pricing changes, and anything that affects your account or extension.',
        '',
        '**@Team posts only.** React with 👍 so we know you\'ve seen important updates.',
        '',
        '_Questions about a post? Ask in **#general** or **#extension-help** — not here._',
    ].join('\n'),
    updates: [
        '🔄 **GitHub updates**',
        '',
        'Every push to [`main`](https://github.com/tmwclaxton/autoapplycv/tree/main) posts here automatically — commit message, author, and link.',
        '',
        '**@Team posts only** (bot). Human announcements still go in **#announcements**.',
        '',
        '_Noisy? Mute this channel and keep **#announcements** unmuted for curated news._',
    ].join('\n'),
    general: [
        '💬 **General**',
        '',
        'Say hello, swap job-hunt war stories, celebrate offers, and talk careers.',
        '',
        '**Before you post** — skim **#rules**. This isn\'t a support desk; for extension bugs head to **#extension-help**, for product ideas try **#feature-requests**.',
        '',
        '_Friendly reminder: AutoCVApply fills forms — you still click Submit._',
    ].join('\n'),
    'extension-help': [
        '🛠 **Extension help**',
        '',
        'Connection JSON, autofill, **Draft All**, cover letters, billing, uploads — if the product misbehaved, ask here.',
        '',
        '**Include in your message**',
        '• Browser (Chrome / Firefox) + extension version',
        '• ATS site & URL (Greenhouse, Ashby, Workday, etc.)',
        '• What you expected vs what happened',
        '• Screenshot if you can (blur personal data)',
        '',
        '⚠️ **Redact your API token** — never paste full connection JSON publicly.',
        '',
        'Docs: [autocvapply.com/how-to](https://autocvapply.com/how-to)',
    ].join('\n'),
    'ats-tips': [
        '🗺 **ATS tips & quirks**',
        '',
        'The long tail of application forms — share what works (and what breaks) on:',
        'Greenhouse · Ashby · Workday · Lever · SmartRecruiters · Teamtailor · BambooHR · and everything else.',
        '',
        '**Great posts here**',
        '• Combobox / multi-step wizard workarounds',
        '• Fields AutoCVApply handles well vs ones that need manual touch',
        '• Screenshots with personal details blurred',
        '',
        '_Verified against 1,850 form scenarios in our test corpus — real-world edge cases still welcome._',
    ].join('\n'),
    'feature-requests': [
        '💡 **Feature requests**',
        '',
        'One idea per message. Upvote with reactions instead of posting duplicates.',
        '',
        '**Helpful context**',
        '• Which ATS or workflow?',
        '• Problem you\'re solving',
        '• Why existing Draft All / autofill doesn\'t cover it',
        '',
        'We read everything. Priority follows impact, safety, and how well we can regression-test it.',
    ].join('\n'),
    showcase: [
        '🏆 **Showcase**',
        '',
        'Wins worth sharing — forms filled in minutes, clever Draft All workflows, offers landed, before/after time saved.',
        '',
        '**Post freely**',
        '• Screenshots & short screen recordings (blur employer names if you prefer)',
        '• Which platform and what AutoCVApply handled',
        '• Optional: what still needed a human touch',
        '',
        '_Inspire the rest of us — job hunting is a grind and progress deserves a shout._',
    ].join('\n'),
};

async function findGuildChannels() {
    return api('GET', `/guilds/${guildId}/channels`);
}

async function ensureRole(name, options) {
    const roles = await api('GET', `/guilds/${guildId}/roles`);
    const existing = roles.find((role) => role.name === name);

    if (existing) {
        console.log(`  role exists: @${name}`);

        return existing;
    }

    const created = await api('POST', `/guilds/${guildId}/roles`, {
        name,
        color: options.color,
        hoist: options.hoist,
        mentionable: false,
    });
    console.log(`  created role: @${name}`);

    return created;
}

async function ensureCategory(name, existingChannels) {
    const found = existingChannels.find(
        (channel) => channel.type === 4 && channel.name === name,
    );

    if (found) {
        console.log(`  category exists: ${name}`);

        return found;
    }

    const created = await api('POST', `/guilds/${guildId}/channels`, {
        name,
        type: 4,
    });
    console.log(`  created category: ${name}`);

    return created;
}

async function ensureTextChannel(name, parentId, topic, existingChannels) {
    const found = existingChannels.find(
        (channel) => channel.type === 0 && channel.name === name,
    );

    if (found) {
        console.log(`  channel exists: #${name}`);

        return found;
    }

    const created = await api('POST', `/guilds/${guildId}/channels`, {
        name,
        type: 0,
        parent_id: parentId,
        topic,
    });
    console.log(`  created channel: #${name}`);

    return created;
}

async function allowBotToPost(channelId, botRoleId) {
    if (!botRoleId) {
        return;
    }

    try {
        // Only grant permissions the bot already has at guild level
        await api('PUT', `/channels/${channelId}/permissions/${botRoleId}`, {
            type: 0,
            allow: '11264',
            deny: '0',
        });
    } catch (error) {
        console.warn(`  could not set bot channel permissions: ${error.message}`);
    }
}

async function setReadonly(channelId, everyoneRoleId, teamRoleId, botRoleId, teamCanPost = false) {
    await api('PUT', `/channels/${channelId}/permissions/${everyoneRoleId}`, {
        type: 0,
        allow: '1024',
        deny: '2048',
    });

    if (teamRoleId) {
        await api('PUT', `/channels/${channelId}/permissions/${teamRoleId}`, {
            type: 0,
            allow: teamCanPost ? '3072' : '1024',
            deny: '0',
        });
    }

    await allowBotToPost(channelId, botRoleId);
}

async function postMessage(channelId, content) {
    const pins = await api('GET', `/channels/${channelId}/pins`).catch(() => []);
    const pinnedBot = pins.find((message) => message.author?.id === DISCORD_APPLICATION_ID);

    if (pinnedBot) {
        if (pinnedBot.content === content) {
            return pinnedBot;
        }

        return api('PATCH', `/channels/${channelId}/messages/${pinnedBot.id}`, { content });
    }

    const messages = await api('GET', `/channels/${channelId}/messages?limit=20`);
    const existing = messages.find(
        (message) => message.author?.id === DISCORD_APPLICATION_ID,
    );

    if (existing) {
        if (existing.content === content) {
            return existing;
        }

        return api('PATCH', `/channels/${channelId}/messages/${existing.id}`, { content });
    }

    return api('POST', `/channels/${channelId}/messages`, { content });
}

async function pinMessage(channelId, channelName, message) {
    const pins = await api('GET', `/channels/${channelId}/pins`);

    if (pins.some((pin) => pin.id === message.id)) {
        console.log(`  already pinned: #${channelName}`);

        return;
    }

    try {
        await api('PUT', `/channels/${channelId}/pins/${message.id}`);
        console.log(`  pinned: #${channelName}`);
    } catch (error) {
        console.warn(`  could not pin #${channelName}: ${error.message}`);
    }
}

async function postAndPin(channelName, channel, content) {
    const message = await postMessage(channel.id, content);
    await pinMessage(channel.id, channelName, message);
    console.log(`  updated: #${channelName}`);
}

async function createPermanentInvite(channelId) {
    const invite = await api('POST', `/channels/${channelId}/invites`, {
        max_age: 0,
        max_uses: 0,
        unique: true,
    });

    return `https://discord.gg/${invite.code}`;
}

async function ensureBotPermissions() {
    const roles = await api('GET', `/guilds/${guildId}/roles`);
    const botRole = roles.find((role) => role.name === 'AutoCVApply');

    if (!botRole) {
        return;
    }

    const permissions = BigInt(botRole.permissions);
    const manageChannels = (permissions & (1n << 4n)) !== 0n;
    const pinMessages = (permissions & (1n << 51n)) !== 0n;

    if (!manageChannels) {
        throw new Error(
            'Bot role is missing Manage Channels. Fix one of:\n'
            + `  • Re-open the invite URL (updates permissions): ${BOT_INVITE_URL}\n`
            + '  • Server Settings → Roles → AutoCVApply → enable Manage Channels',
        );
    }

    if (!pinMessages) {
        console.warn(
            'Warning: bot role is missing Pin Messages — posts will succeed but pins may fail.\n'
            + `  Re-open: ${BOT_INVITE_URL}\n`,
        );
    }
}

async function main() {
    console.log('AutoCVApply Discord server bootstrap\n');

    if (!guildId) {
        console.log('DISCORD_GUILD_ID is not set in .env yet.\n');
        console.log('1. Create a Discord server (or pick an existing one).');
        console.log('2. Open this URL and add the bot (Manage Channels + Manage Roles):');
        console.log(`   ${BOT_INVITE_URL}\n`);
        console.log('3. Enable Developer Mode in Discord → right-click your server → Copy Server ID');
        console.log('4. Set DISCORD_GUILD_ID=... in .env and run: npm run discord:setup\n');
        console.log('Developer portal copy-paste fields:');
        console.log(`  Description: ${PORTAL.description}`);
        console.log(`  Tags: ${PORTAL.tags.join(', ')}`);
        console.log(`  Terms: ${PORTAL.termsUrl}`);
        console.log(`  Privacy: ${PORTAL.privacyUrl}`);
        process.exit(0);
    }

    const guild = await api('GET', `/guilds/${guildId}`);
    console.log(`Guild: ${guild.name} (${guild.id})\n`);

    await ensureBotPermissions();

    console.log('Roles');
    const teamRole = await ensureRole('Team', ROLES[0]);
    await ensureRole('Member', ROLES[1]);
    const botRole = (await api('GET', `/guilds/${guildId}/roles`)).find(
        (role) => role.name === 'AutoCVApply',
    );

    const everyoneRoleId = guild.id;

    console.log('\nChannels');
    let channels = await findGuildChannels();
    const createdChannels = {};

    for (const section of SERVER_LAYOUT) {
        const category = await ensureCategory(section.category, channels);
        channels = await findGuildChannels();

        for (const spec of section.channels) {
            const channel = await ensureTextChannel(
                spec.name,
                category.id,
                spec.topic,
                channels,
            );
            createdChannels[spec.name] = channel;

            if (spec.readonly) {
                await setReadonly(
                    channel.id,
                    everyoneRoleId,
                    teamRole.id,
                    botRole?.id,
                    spec.teamPost ?? false,
                );
            }
        }
    }

    console.log('\nPinned content');

    for (const [channelName, content] of Object.entries(CHANNEL_PIN_MESSAGES)) {
        const channel = createdChannels[channelName];

        if (!channel) {
            continue;
        }

        await postAndPin(channelName, channel, content);
    }

    console.log('\nInvite link');
    const inviteUrl = process.env.DISCORD_INVITE_URL
        || await createPermanentInvite(createdChannels.welcome.id);
    console.log(`  ${inviteUrl}`);
    console.log('\nAdd to .env:');
    console.log(`DISCORD_INVITE_URL=${inviteUrl}`);
    console.log('\nDone.');
}

main().catch((error) => {
    console.error(error.message);

    if (error.message.includes('401') || error.message.includes('403')) {
        console.error('\nCheck that:');
        console.error('• DISCORD_BOT_TOKEN is correct (regenerate if exposed)');
        console.error('• The bot was invited with Manage Channels + Manage Roles:');
        console.error(`  ${BOT_INVITE_URL}`);
    }

    process.exit(1);
});
