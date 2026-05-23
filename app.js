const express = require('express');
const app = express();
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');

const client = new SteamUser();

const GAMES_TO_IDLE = [252950]; // Rocket League
let isStandbyActive = false;
let retryTimeoutReference = null;

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

function initSteamSync() {
    // Clear any pending timeouts to prevent overlapping login loops
    if (retryTimeoutReference) clearTimeout(retryTimeoutReference);

    // If you are on your PC, we check back rapidly (every 30 seconds) 
    // This allows the bot to reclaim the account the moment you close your game.
    const delay = isStandbyActive ? 30000 : (Math.floor(Math.random() * (45000 - 20000 + 1)) + 20000);
    
    console.log(`Scheduling login attempt in ${delay / 1000} seconds...`);
    
    retryTimeoutReference = setTimeout(() => {
        console.log('Initiating backend handshake...');
        
        const logInOptions = {
            accountName: process.env.STEAM_USERNAME,
            password: process.env.STEAM_PASSWORD
        };

        if (process.env.STEAM_SHARED_SECRET) {
            logInOptions.twoFactorCode = SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET);
        }
        
        client.logOn(logInOptions);
    }, delay);
}

client.on('loggedOn', () => {
    console.log('Steam sync successful! Bot has reclaimed farming state.');
    isStandbyActive = false;
    client.setPersona(SteamUser.EPersonaState.Invisible); 
    client.gamesPlayed(GAMES_TO_IDLE);
    console.log(`Hours are actively rolling for games: ${GAMES_TO_IDLE.join(', ')}`);
});

client.on('error', (err) => {
    console.log(`Handshake update: ${err.message}`);
    
    // Check if the error is caused by your PC session kicking the bot offline
    if (err.message.includes('Logged in elsewhere') || err.eresult === SteamUser.EResult.LoggedInElsewhere) {
        console.log('⚠️ PC gameplay session active. Bot yielding priority.');
        isStandbyActive = true;
        initSteamSync(); // Trigger the rapid 30-second checking loop
    } else {
        // For general network or rate limit errors, default to a safer 30-minute fallback delay
        isStandbyActive = false;
        if (retryTimeoutReference) clearTimeout(retryTimeoutReference);
        retryTimeoutReference = setTimeout(initSteamSync, 1000 * 60 * 30);
    }
});

// Start the core process execution
initSteamSync();
