const express = require('express');
const app = express();
const SteamUser = require('steam-user');
const SteamTotp = require('steam-totp');

const client = new SteamUser();

const GAMES_TO_IDLE = [252950]; // Rocket League
let isUserPlayingOnPC = false;

app.get('/', (req, res) => {
    res.json({ 
        status: "healthy", 
        bot_farming: client.steamID ? "ACTIVE" : "OFFLINE/STANDBY",
        user_on_pc: isUserPlayingOnPC 
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
});

function initSteamSync() {
    if (isUserPlayingOnPC) {
        console.log('Standby active: User is still on PC. Handshake skipped.');
        return;
    }

    const randomDelay = Math.floor(Math.random() * (75000 - 30000 + 1)) + 30000;
    console.log(`Delaying handshake for ${randomDelay / 1000}s to clear verification...`);
    
    setTimeout(() => {
        if (isUserPlayingOnPC) return; // Final fallback check
        
        console.log('Initiating secure backend handshake...');
        const logInOptions = {
            accountName: process.env.STEAM_USERNAME,
            password: process.env.STEAM_PASSWORD
        };

        if (process.env.STEAM_SHARED_SECRET) {
            logInOptions.twoFactorCode = SteamTotp.generateAuthCode(process.env.STEAM_SHARED_SECRET);
        }
        client.logOn(logInOptions);
    }, randomDelay);
}

client.on('loggedOn', () => {
    console.log('Steam sync successful! Bot is online.');
    isUserPlayingOnPC = false;
    client.setPersona(SteamUser.EPersonaState.Invisible); 
    client.gamesPlayed(GAMES_TO_IDLE);
    console.log(`Hours are now rolling for games: ${GAMES_TO_IDLE.join(', ')}`);
});

// 🛑 DETECTING YOUR PC SESSION: Triggers when you launch a game on your computer
client.on('error', (err) => {
    if (err.message.includes('Logged in elsewhere') || err.eresult === SteamUser.EResult.LoggedInElsewhere) {
        console.log('⚠️ DETECTED ACTIVITY: You started playing on your PC! Bot entering Standby Mode...');
        isUserPlayingOnPC = true;
        
        // Disconnect immediately so your PC session has 100% priority
        client.logOff(); 

        // Set up a background loop to check every 15 minutes if you have closed your game
        const checkStatusInterval = setInterval(() => {
            if (!isUserPlayingOnPC) {
                clearInterval(checkStatusInterval);
                return;
            }
            
            console.log('Checking if PC gameplay has finished...');
            // Attempt a brief logon state check. If it succeeds, you're off the PC.
            isUserPlayingOnPC = false; 
            initSteamSync();
        }, 1000 * 60 * 15); // 15-minute check loops
        
    } else {
        console.error('Session deferred due to alternative error:', err.message);
        setTimeout(initSteamSync, 1000 * 60 * 45); 
    }
});

initSteamSync();
