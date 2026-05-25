const express = require('express');
const app = express();
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');

const client = new SteamUser();

const GAMES_TO_IDLE = [252950, 559650];

let isStandbyActive = false;
let retryTimeoutReference = null;

// 🔴 NEU: RateLimit Handling
let rateLimitUntil = 0;
let retryDelay = 30; // Startwert in Sekunden

app.get('/', (req, res) => {
    res.json({ 
        status: "healthy", 
        bot_farming: client.steamID ? "ACTIVE" : "STANDBY/TRYING",
        user_on_pc: isStandbyActive 
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});

// 🔧 Hilfsfunktion für Login
function attemptLogin() {
    const now = Date.now();

    // 🔴 RateLimit aktiv → warten
    if (now < rateLimitUntil) {
        const remaining = Math.ceil((rateLimitUntil - now) / 1000);
        console.log(`⏳ Still rate limited. Waiting ${remaining}s...`);
        initSteamSync(remaining * 1000);
        return;
    }

    console.log('Initiating backend handshake...');

    const logInOptions = {
        accountName: process.env.STEAM_USERNAME,
        password: process.env.STEAM_PASSWORD
    };

    if (process.env.STEAM_SHARED_SECRET) {
        logInOptions.twoFactorCode = SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET);
    }

    client.logOn(logInOptions);
}

function initSteamSync(customDelay = null) {
    if (retryTimeoutReference) clearTimeout(retryTimeoutReference);

    let delay;

    if (customDelay) {
        delay = customDelay;
    } else {
        delay = isStandbyActive
            ? 30000
            : (Math.floor(Math.random() * (45000 - 20000 + 1)) + 20000);
    }

    console.log(`Scheduling login attempt in ${Math.ceil(delay / 1000)} seconds...`);

    retryTimeoutReference = setTimeout(() => {
        attemptLogin();
    }, delay);
}

client.on('loggedOn', () => {
    console.log('Steam sync successful! Bot has reclaimed farming state.');

    isStandbyActive = false;

    // 🔴 Reset RateLimit + Backoff
    rateLimitUntil = 0;
    retryDelay = 30;

    client.setPersona(SteamUser.EPersonaState.Invisible); 
    client.gamesPlayed(GAMES_TO_IDLE);

    console.log(`Hours are actively rolling for games: ${GAMES_TO_IDLE.join(', ')}`);
});

client.on('error', (err) => {
    console.log(`Handshake update: ${err.message}`);

    // 🔴 LoggedInElsewhere
    if (
        err.message.includes('Logged in elsewhere') ||
        err.eresult === SteamUser.EResult.LoggedInElsewhere
    ) {
        console.log('⚠️ PC gameplay session active. Bot yielding priority.');

        isStandbyActive = true;

        // Kein aggressives reconnect → normal weiter
        initSteamSync();
        return;
    }

    // 🔴 RateLimit Handling
    if (
        err.message.includes('RateLimitExceeded') ||
        err.eresult === SteamUser.EResult.RateLimitExceeded
    ) {
        const now = Date.now();

        // Exponential Backoff (max 5 Minuten)
        retryDelay = Math.min(Math.floor(retryDelay * 1.5), 300);

        rateLimitUntil = now + retryDelay * 1000;

        const retryDate = new Date(rateLimitUntil);

        console.log('⚠️ RateLimitExceeded');
        console.log(`⏳ Backoff: ${retryDelay} seconds`);
        console.log(`🕒 Retry at: ${retryDate.toLocaleTimeString()}`);

        initSteamSync(retryDelay * 1000);
        return;
    }

    // 🔴 Sonstige Fehler → konservativ warten
    console.log('⚠️ Unknown error → fallback 5 minutes');

    isStandbyActive = false;

    retryDelay = 300;
    rateLimitUntil = Date.now() + retryDelay * 1000;

    initSteamSync(retryDelay * 1000);
});

// Start
initSteamSync();
