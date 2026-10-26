const socket = io();

// Avatar symbols map
const AVATAR_SYMBOLS = {
    1: '🦁', 2: '🐯', 3: '🦅', 4: '🐘',
    5: '🐺', 6: '🦊', 7: '🐼', 8: '🐲'
};

let currentUser = {
    username: 'Pemberani_1',
    avatar_id: 1,
    mmr_points: 100,
    rank: 'Beginner'
};

let gameMode = 'solo'; // 'solo', 'local', 'online'
let localGame = null;
let onlineRoomCode = null;

// DOM Elements
const screens = {
    login: document.getElementById('screen-login'),
    menu: document.getElementById('screen-menu'),
    room: document.getElementById('screen-room'),
    game: document.getElementById('screen-game')
};

function switchScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Avatar selection
document.querySelectorAll('.avatar-option').forEach(opt => {
    opt.addEventListener('click', () => {
        document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        currentUser.avatar_id = parseInt(opt.getAttribute('data-id'));
    });
});

// Login
document.getElementById('btn-login').addEventListener('click', () => {
    let nameInput = document.getElementById('input-username').value.trim();
    if (nameInput) currentUser.username = nameInput;

    socket.emit('login_player', {
        username: currentUser.username,
        avatar_id: currentUser.avatar_id
    });
});

socket.on('login_response', (res) => {
    if (res.success) {
        currentUser = { ...currentUser, ...res.player };
        document.getElementById('display-username').innerText = currentUser.username;
        document.getElementById('display-mmr').innerText = currentUser.mmr_points;
        document.getElementById('display-rank').innerText = res.rank;
        switchScreen('menu');
    } else {
        alert(res.message || 'Login gagal');
    }
});

// Leaderboard Modal
document.getElementById('btn-show-leaderboard').addEventListener('click', () => {
    document.getElementById('modal-leaderboard').style.display = 'flex';
    socket.emit('get_leaderboard');
});

document.getElementById('btn-close-leaderboard').addEventListener('click', () => {
    document.getElementById('modal-leaderboard').style.display = 'none';
});

socket.on('leaderboard_data', (data) => {
    let listHtml = '<table style="width:100%; text-align:left; font-size:14px; border-collapse: collapse;">';
    listHtml += '<tr style="border-bottom: 1px solid rgba(0,0,0,0.1);"><th style="padding:8px;">Rank</th><th style="padding:8px;">Nama</th><th style="padding:8px;">MMR</th><th style="padding:8px;">Menang</th></tr>';
    data.forEach((p, idx) => {
        listHtml += `<tr style="border-bottom: 1px solid rgba(0,0,0,0.05);"><td style="padding:8px;">#${idx+1} ${p.rank}</td><td style="padding:8px;">${AVATAR_SYMBOLS[p.avatar_id] || ''} ${p.username}</td><td style="padding:8px;">${p.mmr_points}</td><td style="padding:8px;">${p.total_wins}</td></tr>`;
    });
    listHtml += '</table>';
    document.getElementById('leaderboard-list').innerHTML = listHtml;
});

// Menu Mode Selection
document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', () => {
        gameMode = btn.getAttribute('data-mode');
        if (gameMode === 'online') {
            switchScreen('room');
        } else {
            startLocalOrSoloGame(gameMode);
        }
    });
});

document.getElementById('btn-back-menu').addEventListener('click', () => switchScreen('menu'));

// Online Room Handlers
document.getElementById('btn-create-room').addEventListener('click', () => {
    socket.emit('create_room', {
        username: currentUser.username,
        avatar: currentUser.avatar_id
    });
});

document.getElementById('btn-join-room').addEventListener('click', () => {
    let code = document.getElementById('input-room-code').value.trim();
    if (code.length === 4) {
        socket.emit('join_room', {
            roomCode: code,
            username: currentUser.username,
            avatar: currentUser.avatar_id
        });
    } else {
        alert('Masukkan kode 4 digit dengan benar.');
    }
});

socket.on('room_joined', (data) => {
    onlineRoomCode = data.roomCode;
    document.getElementById('span-room-code').innerText = data.roomCode;
    document.getElementById('room-waiting-area').style.display = 'block';
    updateRoomLobbyUI(data.room);
});

socket.on('room_update', (room) => {
    updateRoomLobbyUI(room);
});

function updateRoomLobbyUI(room) {
    let listHtml = '';
    room.players.forEach((p, i) => {
        listHtml += `<div style="padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.05);">Pemain ${i+1}: ${AVATAR_SYMBOLS[p.avatar] || '🦁'} <strong>${p.username}</strong> ${p.id === room.host ? '(Host)' : ''}</div>`;
    });
    document.getElementById('room-players-list').innerHTML = listHtml;
    
    let startBtn = document.getElementById('btn-start-online-game');
    if (room.host === socket.id) {
        startBtn.style.display = 'block';
    } else {
        startBtn.style.display = 'none';
    }
}

document.getElementById('btn-start-online-game').addEventListener('click', () => {
    if (onlineRoomCode) {
        socket.emit('start_game', onlineRoomCode);
    }
});

socket.on('game_started', (room) => {
    switchScreen('game');
    renderGame(room);
});

socket.on('room_error', (msg) => alert(msg));

// --- LOCAL / SOLO GAME LOGIC ---
function startLocalOrSoloGame(mode) {
    let players = [
        { id: 'p1', username: currentUser.username, avatar: currentUser.avatar_id, pos: 1, targetPos: 1, isBot: false, skipTurn: false, shield: false }
    ];

    if (mode === 'solo') {
        players.push({ id: 'bot1', username: 'BOT iOS', avatar: 2, pos: 1, targetPos: 1, isBot: true, skipTurn: false, shield: false });
    } else if (mode === 'local') {
        players.push({ id: 'p2', username: 'Pemberani 2', avatar: 3, pos: 1, targetPos: 1, isBot: false, skipTurn: false, shield: false });
    }

    localGame = {
        code: 'local_game',
        players: players,
        board: generateLocalBoard(),
        turnIndex: 0,
        status: 'playing',
        lastDice: 3
    };

    switchScreen('game');
    renderGame(localGame);
}

function generateLocalBoard() {
    let snakes = [];
    let ladders = [];
    let cardTiles = [];

    for (let r = 1; r <= 8; r++) {
        let rowStart = r * 10 + 1;
        if (Math.random() < 0.7) {
            let from = rowStart + Math.floor(Math.random() * 7) + 1;
            let to = from - (Math.floor(Math.random() * 15) + 5);
            if (to > 0 && from > to) snakes.push({ from, to });
        }
        if (Math.random() < 0.7) {
            let from = rowStart + Math.floor(Math.random() * 7);
            let to = from + (Math.floor(Math.random() * 15) + 5);
            if (to < 100 && from < to) ladders.push({ from, to });
        }
    }

    while (cardTiles.length < 14) {
        let tile = Math.floor(Math.random() * 96) + 2;
        if (!cardTiles.includes(tile) && !snakes.some(s => s.from === tile) && !ladders.some(l => l.from === tile)) {
            cardTiles.push(tile);
        }
    }

    return { snakes, ladders, cardTiles };
}

// Roll Dice Button with Animation
document.getElementById('btn-roll-dice').addEventListener('click', () => {
    triggerDiceAnimation(() => {
        if (gameMode === 'online') {
            socket.emit('roll_dice', { roomCode: onlineRoomCode });
        } else {
            playLocalTurn();
        }
    });
});

function triggerDiceAnimation(callback) {
    let diceEl = document.getElementById('dice-display');
    diceEl.classList.add('rolling');
    let count = 0;
    let interval = setInterval(() => {
        diceEl.querySelector('span').innerText = Math.floor(Math.random() * 6) + 1;
        count++;
        if (count > 8) {
            clearInterval(interval);
            diceEl.classList.remove('rolling');
            if (callback) callback();
        }
    }, 50);
}

// Full 30 Green Cards (Positive) for Local Game
const GREEN_CARDS = [
    { id: 1, text: "Maju 3 kotak", type: 'green', action: (player) => { player.pos += 3; } },
    { id: 2, text: "Maju = Dadu x2", type: 'green', action: (player, dice) => { player.pos += (dice * 2); } },
    { id: 3, text: "Teleportasi ke Tangga Terdekat", type: 'green', action: (player, dice, state) => { 
        let nextLadder = state.board.ladders.find(l => l.from > player.pos);
        if (nextLadder) player.pos = nextLadder.to;
        else player.pos += 5;
    } },
    { id: 4, text: "Tukar Posisi dengan Terdepan", type: 'green', action: (player, dice, state) => {
        let leader = state.players.reduce((max, p) => p.pos > max.pos ? p : max, state.players[0]);
        if (leader.id !== player.id) {
            let temp = player.pos; player.pos = leader.pos; leader.pos = temp;
        }
    } },
    { id: 5, text: "Perisai Hewan (Kebal 1 Trap)", type: 'green', action: (player) => { player.shield = true; } },
    { id: 6, text: "Ekstra Dadu (Lempar lagi)", type: 'green', action: (player) => { player.pos += 2; } },
    { id: 7, text: "Pengawal (+1 kotak ekstra)", type: 'green', action: (player) => { player.pos += 1; } },
    { id: 8, text: "Lompat ke Genap Terdekat", type: 'green', action: (player) => { 
        while(player.pos < 100 && player.pos % 2 !== 0) player.pos++;
    } },
    { id: 9, text: "Bebas Pilih Dadu (1-6)", type: 'green', action: (player) => { player.pos += 4; } },
    { id: 10, text: "Tarik Pemain Belakang ke Posismu", type: 'green', action: (player, dice, state) => {
        state.players.forEach(p => { if(p.id !== player.id && p.pos < player.pos) p.pos = player.pos; });
    } },
    { id: 11, text: "Kebal Kartu Merah (2 Turn)", type: 'green', action: (player) => { player.redImmunity = 2; } },
    { id: 12, text: "Teleport +10 Kotak", type: 'green', action: (player) => { player.pos += 10; } },
    { id: 13, text: "Sejajarkan Posisi dengan Terdepan", type: 'green', action: (player, dice, state) => {
        let leader = state.players.reduce((max, p) => p.pos > max.pos ? p : max, state.players[0]);
        player.pos = leader.pos;
    } },
    { id: 14, text: "Naik 1 Baris (+10)", type: 'green', action: (player) => { player.pos += 10; } },
    { id: 15, text: "Simpan Kartu Penangkal Merah", type: 'green', action: (player) => { player.savedShieldCard = true; } },
    { id: 16, text: "Lempar 2 Dadu Sekaligus", type: 'green', action: (player) => { player.pos += 6; } },
    { id: 17, text: "Maju 5 Kotak Bebas Trap", type: 'green', action: (player) => { player.pos += 5; } },
    { id: 18, text: "Pawang Hewan (Hewan jadi Naik)", type: 'green', action: (player) => { player.tamer = true; } },
    { id: 19, text: "Copy Dadu Lawan Sebelumnya", type: 'green', action: (player, dice, state) => { player.pos += (state.lastDice || 3); } },
    { id: 20, text: "Lompat ke Kelipatan 10 Terdekat", type: 'green', action: (player) => {
        while(player.pos < 100 && player.pos % 10 !== 0) player.pos++;
    } },
    { id: 21, text: "Kebal Tukar Posisi (3 Turn)", type: 'green', action: (player) => { player.swapImmunity = 3; } },
    { id: 22, text: "Dorong Lawan Terdepan Mundur 2", type: 'green', action: (player, dice, state) => {
        let leader = state.players.reduce((max, p) => p.pos > max.pos ? p : max, state.players[0]);
        if(leader.id !== player.id) leader.pos = Math.max(1, leader.pos - 2);
    } },
    { id: 23, text: "Jalan Tol (+3 Kotak)", type: 'green', action: (player) => { player.pos += 3; } },
    { id: 24, text: "Sapu Bersih Kotak Sama (-3 Musuh)", type: 'green', action: (player, dice, state) => {
        state.players.forEach(p => { if(p.id !== player.id && p.pos === player.pos) p.pos = Math.max(1, p.pos - 3); });
    } },
    { id: 25, text: "Maju 1 & Ambil Kartu Lagi", type: 'green', action: (player) => { player.pos += 2; } },
    { id: 26, text: "Shortcut ke Petak 50 (Jika < 50)", type: 'green', action: (player) => { if(player.pos < 50) player.pos = 50; else player.pos += 5; } },
    { id: 27, text: "Curi Giliran Lawan (Extra Turn)", type: 'green', action: (player) => { player.pos += 3; } },
    { id: 28, text: "Ubah Trap Terdekat jadi Tangga", type: 'green', action: (player) => { player.pos += 4; } },
    { id: 29, text: "Guaranteed High Dadu (Next Turn 6)", type: 'green', action: (player) => { player.nextDiceSix = true; } },
    { id: 30, text: "Berdiri 1 Kotak di Belakang Terdepan", type: 'green', action: (player, dice, state) => {
        let leader = state.players.reduce((max, p) => p.pos > max.pos ? p : max, state.players[0]);
        player.pos = Math.max(1, leader.pos - 1);
    } }
];

// Full 30 Red Cards (Negative) for Local Game
const RED_CARDS = [
    { id: 1, text: "Mundur 3 kotak", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 3); } },
    { id: 2, text: "Mundur = Dadu Sebelumnya", type: 'red', action: (player, dice, state) => { player.pos = Math.max(1, player.pos - (state.lastDice || 2)); } },
    { id: 3, text: "Jatuh ke Hewan Ganas Terdekat", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 5); } },
    { id: 4, text: "Tukar Posisi dengan Terbelakang", type: 'red', action: (player, dice, state) => {
        let trailer = state.players.reduce((min, p) => p.pos < min.pos ? p : min, state.players[0]);
        if(trailer.id !== player.id) {
            let temp = player.pos; player.pos = trailer.pos; trailer.pos = temp;
        }
    } },
    { id: 5, text: "Kena Begal (-5 & Skip Turn)", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 5); player.skipTurn = true; } },
    { id: 6, text: "Freeze (Skip 1 Turn)", type: 'red', action: (player) => { player.skipTurn = true; } },
    { id: 7, text: "Dadu Minus 2 (Next Turn)", type: 'red', action: (player) => { player.diceMinus = 2; } },
    { id: 8, text: "Terlempar Mundur 10 Kotak", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 10); } },
    { id: 9, text: "Jalan Mundur di Turn Berikutnya", type: 'red', action: (player) => { player.reverseWalk = true; } },
    { id: 10, text: "Tarik Depan Ikut Mundur", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 4); } },
    { id: 11, text: "Lempar ke Petak Awal (jika < 20)", type: 'red', action: (player) => { if(player.pos < 20) player.pos = 1; } },
    { id: 12, text: "Harus Dadu Genap Baru Bisa Jalan", type: 'red', action: (player) => { player.needEven = true; } },
    { id: 13, text: "Turun 1 Baris (-10)", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 10); } },
    { id: 14, text: "Dadu Maksimal 3", type: 'red', action: (player) => { player.maxDice = 3; } },
    { id: 15, text: "Lumpur (Must Roll 6 to Exit)", type: 'red', action: (player) => { player.inMud = true; } },
    { id: 16, text: "Swap dengan Pemain di Belakangmu", type: 'red', action: (player, dice, state) => {
        let behind = state.players.filter(p => p.pos < player.pos);
        if(behind.length > 0) {
            let target = behind[Math.floor(Math.random() * behind.length)];
            let temp = player.pos; player.pos = target.pos; target.pos = temp;
        }
    } },
    { id: 17, text: "Mundur ke Ganjil Terdekat", type: 'red', action: (player) => { while(player.pos > 1 && player.pos % 2 === 0) player.pos--; } },
    { id: 18, text: "Efek Domino (Tabrak Lawan -2)", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 2); } },
    { id: 19, text: "Rugi Massal (Semua Pemain -2)", type: 'red', action: (player, dice, state) => {
        state.players.forEach(p => p.pos = Math.max(1, p.pos - 2));
    } },
    { id: 20, text: "Hipnosis (Arah Dibalik)", type: 'red', action: (player) => { player.reverseWalk = true; } },
    { id: 21, text: "Langkah Berat (Cuma Boleh +1)", type: 'red', action: (player) => { player.heavyStep = true; } },
    { id: 22, text: "Mundur ke Kelipatan 5 Terdekat", type: 'red', action: (player) => { while(player.pos > 1 && player.pos % 5 !== 0) player.pos--; } },
    { id: 23, text: "Draw 1 Kartu Merah Lagi", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 2); } },
    { id: 24, text: "Mundur 2 & Hangus Item", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 2); player.shield = false; } },
    { id: 25, text: "Sumpah Dadu (Pasti 1-3)", type: 'red', action: (player) => { player.badDice = true; } },
    { id: 26, text: "Gravitasi (Dadu 6 Dilarang Jalan)", type: 'red', action: (player) => { player.noSix = true; } },
    { id: 27, text: "Perangkap Massal (Tarik Semua ke Kotakmu)", type: 'red', action: (player, dice, state) => {
        state.players.forEach(p => { if(p.id !== player.id) p.pos = player.pos; });
    } },
    { id: 28, text: "Reset ke Checkpoint Terdekat", type: 'red', action: (player) => {
        if(player.pos > 75) player.pos = 75;
        else if(player.pos > 50) player.pos = 50;
        else if(player.pos > 25) player.pos = 25;
        else player.pos = 1;
    } },
    { id: 29, text: "Dadu Bagi 2 (Bulatkan Bawah)", type: 'red', action: (player, dice) => { player.pos += Math.floor((dice || 4) / 2); } },
    { id: 30, text: "Lempar Mundur 8", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 8); } }
];

function playLocalTurn() {
    if (localGame.status !== 'playing') return;
    let currPlayer = localGame.players[localGame.turnIndex];

    if (currPlayer.skipTurn) {
        currPlayer.skipTurn = false;
        document.getElementById('game-status-text').innerText = `${currPlayer.username} diskip turn-nya!`;
        localGame.turnIndex = (localGame.turnIndex + 1) % localGame.players.length;
        renderGame(localGame);
        checkBotTurn();
        return;
    }

    let dice = Math.floor(Math.random() * 6) + 1;
    localGame.lastDice = dice;
    document.getElementById('dice-display').querySelector('span').innerText = dice;

    let targetPos = currPlayer.pos + dice;
    if (targetPos > 100) {
        let excess = targetPos - 100;
        targetPos = 100 - excess;
    }
    
    // Smooth animated token movement with jump arc
    animateTokenMovement(currPlayer, targetPos, () => {
        let snakeHit = localGame.board.snakes.find(s => s.from === currPlayer.pos);
        let ladderHit = localGame.board.ladders.find(l => l.from === currPlayer.pos);
        let cardHit = localGame.board.cardTiles.includes(currPlayer.pos);

        let msg = `${currPlayer.username} melempar dadu [${dice}] -> Petak ${targetPos}`;

        if (snakeHit) {
            animateTokenMovement(currPlayer, snakeHit.to, () => {
                msg += ` | 🐍 Kena Ular! Meluncur turun ke ${snakeHit.to}`;
                finishTurnCheck(currPlayer, msg);
            });
        } else if (ladderHit) {
            animateTokenMovement(currPlayer, ladderHit.to, () => {
                msg += ` | 🐒 Menemukan Tangga Menari! Naik ke ${ladderHit.to}`;
                finishTurnCheck(currPlayer, msg);
            });
        } else if (cardHit) {
            // Random 50:50 Green or Red Card
            let isGreen = Math.random() < 0.5;
            let deck = isGreen ? GREEN_CARDS : RED_CARDS;
            let card = deck[Math.floor(Math.random() * deck.length)];
            
            msg += ` | 📜 Kartu Takdir [${isGreen ? 'HIJAU (+)' : 'MERAH (-)'}]: ${card.text}`;
            
            showCardModal(isGreen ? "✨ Kartu Takdir Hijau (Positif)" : "⚡ Kartu Takdir Merah (Negatif)", card.text, () => {
                card.action(currPlayer, dice, localGame);
                // Ensure valid bounds 1-100
                currPlayer.pos = Math.max(1, Math.min(100, currPlayer.pos));
                
                animateTokenMovement(currPlayer, currPlayer.pos, () => {
                    finishTurnCheck(currPlayer, msg);
                });
            });
        } else {
            finishTurnCheck(currPlayer, msg);
        }
    });
}

function animateTokenMovement(player, destination, onComplete) {
    if (player.pos === destination) {
        player.animFrom = player.pos;
        player.animTo = player.pos;
        player.animProgress = 1;
        if (onComplete) onComplete();
        return;
    }
    let step = player.pos < destination ? 1 : -1;
    let nextPos = player.pos + step;
    
    player.animFrom = player.pos;
    player.animTo = nextPos;
    player.animProgress = 0;
    
    let startTime = performance.now();
    let duration = 280; // Smooth step duration

    function stepAnim(now) {
        let elapsed = now - startTime;
        let progress = Math.min(1, elapsed / duration);
        
        player.animProgress = progress;
        // Parabolic jump arc (height 28px)
        player.jumpOffset = Math.sin(progress * Math.PI) * 28;
        
        renderGame(localGame);

        if (progress < 1) {
            requestAnimationFrame(stepAnim);
        } else {
            player.pos = nextPos;
            player.animFrom = nextPos;
            player.animTo = nextPos;
            player.animProgress = 1;
            player.jumpOffset = 0;
            renderGame(localGame);
            
            if (player.pos !== destination) {
                animateTokenMovement(player, destination, onComplete);
            } else {
                if (onComplete) onComplete();
            }
        }
    }
    requestAnimationFrame(stepAnim);
}

function finishTurnCheck(currPlayer, msg) {
    document.getElementById('game-status-text').innerText = msg;

    if (currPlayer.pos === 100) {
        localGame.status = 'finished';
        document.getElementById('gameover-title').innerText = "🎉 PEMENANG iOS RIMBA 🎉";
        document.getElementById('gameover-msg').innerText = `${currPlayer.username} berhasil mencapai Finish Petak 100 dengan gemilang!`;
        document.getElementById('modal-gameover').style.display = 'flex';
        return;
    }

    localGame.turnIndex = (localGame.turnIndex + 1) % localGame.players.length;
    renderGame(localGame);
    checkBotTurn();
}

function checkBotTurn() {
    if (localGame && localGame.status === 'playing') {
        let currPlayer = localGame.players[localGame.turnIndex];
        if (currPlayer.isBot) {
            document.getElementById('game-status-text').innerText = `${currPlayer.username} sedang berpikir... 🤖`;
            setTimeout(() => {
                triggerDiceAnimation(playLocalTurn);
            }, 2000); // 2 seconds thinking delay for bot
        }
    }
}

// Socket online game listeners
socket.on('dice_rolled', (data) => {
    document.getElementById('dice-display').querySelector('span').innerText = data.dice;
    document.getElementById('game-status-text').innerText = data.eventMessage;
    renderGame(data.room);
    if (data.triggeredCard) {
        showCardModal("✨ KARTU TAKDIR iOS", data.triggeredCard.text, () => {});
    }
});

socket.on('game_over', (data) => {
    document.getElementById('gameover-title').innerText = "🎉 PERMAINAN SELESAI";
    document.getElementById('gameover-msg').innerText = data.message;
    document.getElementById('modal-gameover').style.display = 'flex';
});

document.getElementById('btn-back-to-menu').addEventListener('click', () => {
    document.getElementById('modal-gameover').style.display = 'none';
    switchScreen('menu');
});

document.getElementById('btn-quit-game').addEventListener('click', () => {
    switchScreen('menu');
});

// Card Modal helper with iOS Spring animation
function showCardModal(title, text, onClose) {
    document.getElementById('card-modal-title').innerText = title;
    document.getElementById('card-modal-text').innerText = text;
    let modal = document.getElementById('modal-card');
    modal.style.display = 'flex';

    let btn = document.getElementById('btn-close-card');
    let newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', () => {
        modal.style.display = 'none';
        if (onClose) onClose();
    });
}

// --- CANVAS BOARD RENDERER WITH DANCING SPRITES & iOS GLASS STYLE ---
const canvas = document.getElementById('boardCanvas');
const ctx = canvas.getContext('2d');
const tileSize = 55;

let animationFrameTick = 0;

function renderGame(state) {
    animationFrameTick += 0.05;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw 10x10 iOS Glass Grid
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            let tileNum = getTileNumber(r, c);
            let x = c * tileSize + 25;
            let y = r * tileSize + 25;

            // iOS translucent tiles
            ctx.fillStyle = (tileNum % 2 === 0) ? 'rgba(255, 255, 255, 0.7)' : 'rgba(240, 244, 255, 0.9)';
            ctx.fillRect(x, y, tileSize, tileSize);
            ctx.strokeStyle = 'rgba(0, 122, 255, 0.15)';
            ctx.strokeRect(x, y, tileSize, tileSize);

            ctx.fillStyle = '#8e8e93';
            ctx.font = '11px -apple-system, sans-serif';
            ctx.fillText(tileNum, x + 4, y + 14);

            // Check card tile
            if (state.board.cardTiles && state.board.cardTiles.includes(tileNum)) {
                ctx.fillStyle = '#af52de';
                ctx.font = '14px sans-serif';
                ctx.fillText('✨', x + 18, y + 35);
            }
        }
    }

    // Draw Extended Ladders & Realistic Snakes (Real Snakes & Ladders style)
    if (state.board.ladders) {
        state.board.ladders.forEach(l => {
            drawExtendedLadder(l.from, l.to);
        });
    }
    if (state.board.snakes) {
        state.board.snakes.forEach(s => {
            drawSnake(s.from, s.to);
        });
    }

    // Draw Players Tokens with smooth parabolic jump arc between tiles
    state.players.forEach((p, idx) => {
        let coords;
        let bounceOffset = Math.sin(animationFrameTick * 3 + idx) * 3;
        let jumpOffset = p.jumpOffset || 0;

        if (p.animFrom !== undefined && p.animTo !== undefined && p.animProgress < 1) {
            let c1 = getTileCoords(p.animFrom);
            let c2 = getTileCoords(p.animTo);
            let cx = c1.x + (c2.x - c1.x) * p.animProgress;
            let cy = c1.y + (c2.y - c1.y) * p.animProgress;
            coords = { x: cx, y: cy };
        } else {
            coords = getTileCoords(p.pos);
        }
        
        ctx.fillStyle = getIOSColor(idx);
        ctx.beginPath();
        ctx.arc(coords.x + 15 + (idx * 6), coords.y + 32 + bounceOffset - jumpOffset, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '15px sans-serif';
        ctx.fillText(AVATAR_SYMBOLS[p.avatar] || '🦁', coords.x + 6 + (idx * 6), coords.y + 38 + bounceOffset - jumpOffset);
    });

    // Update Sidebar Scoreboard
    let sbHtml = '';
    state.players.forEach((p, idx) => {
        let isTurn = state.players[state.turnIndex].id === p.id;
        sbHtml += `<div class="player-score-card ${isTurn ? 'active-turn' : ''}">
            <span>${AVATAR_SYMBOLS[p.avatar]} <strong>${p.username}</strong></span>
            <span>Petak: <strong>${p.pos}</strong></span>
        </div>`;
    });
    document.getElementById('players-score-board').innerHTML = sbHtml;
}

function getTileNumber(r, c) {
    let rowFromBottom = 9 - r;
    if (rowFromBottom % 2 === 0) {
        return rowFromBottom * 10 + c + 1;
    } else {
        return rowFromBottom * 10 + (9 - c) + 1;
    }
}

function getTileCoords(num) {
    let zeroIdx = num - 1;
    let r = 9 - Math.floor(zeroIdx / 10);
    let c = zeroIdx % 10;
    if ((9 - r) % 2 !== 0) {
        c = 9 - c;
    }
    return { x: c * tileSize + 10, y: r * tileSize + 10 };
}

function drawExtendedLadder(from, to) {
    let p1 = getTileCoords(from);
    let p2 = getTileCoords(to);
    let cx1 = p1.x + tileSize / 2;
    let cy1 = p1.y + tileSize / 2;
    let cx2 = p2.x + tileSize / 2;
    let cy2 = p2.y + tileSize / 2;

    let dx = cx2 - cx1;
    let dy = cy2 - cy1;
    let len = Math.sqrt(dx * dx + dy * dy);
    let nx = -dy / len * 7;
    let ny = dx / len * 7;

    // Ladder side rails (Wood/Bronze color)
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx1 + nx, cy1 + ny);
    ctx.lineTo(cx2 + nx, cy2 + ny);
    ctx.moveTo(cx1 - nx, cy1 - ny);
    ctx.lineTo(cx2 - nx, cy2 - ny);
    ctx.stroke();

    // Ladder rungs (anak tangga)
    let numRungs = Math.max(4, Math.floor(len / 18));
    ctx.strokeStyle = '#A0522D';
    ctx.lineWidth = 3;
    for (let i = 1; i < numRungs; i++) {
        let t = i / numRungs;
        let rx1 = (cx1 + nx) + ((cx2 + nx) - (cx1 + nx)) * t;
        let ry1 = (cy1 + ny) + ((cy2 + ny) - (cy1 + ny)) * t;
        let rx2 = (cx1 - nx) + ((cx2 - nx) - (cx1 - nx)) * t;
        let ry2 = (cy1 - ny) + ((cy2 - ny) - (cy1 - ny)) * t;

        ctx.beginPath();
        ctx.moveTo(rx1, ry1);
        ctx.lineTo(rx2, ry2);
        ctx.stroke();
    }

    // Ladder emoji at base
    ctx.font = '18px sans-serif';
    ctx.fillText('🪜', cx1 - 9, cy1 + 6);
}

function drawSnake(from, to) {
    let p1 = getTileCoords(from); // Head (higher number)
    let p2 = getTileCoords(to);   // Tail (lower number)
    let cx1 = p1.x + tileSize / 2;
    let cy1 = p1.y + tileSize / 2;
    let cx2 = p2.x + tileSize / 2;
    let cy2 = p2.y + tileSize / 2;

    let midX = (cx1 + cx2) / 2 + 35 * Math.sin(animationFrameTick);
    let midY = (cy1 + cy2) / 2 - 25;

    // Snake body curve (Green/Red serpentine pattern)
    ctx.strokeStyle = '#27ae60';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx1, cy1);
    ctx.quadraticCurveTo(midX, midY, cx2, cy2);
    ctx.stroke();

    // Snake belly stripe / pattern
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 4;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(cx1, cy1);
    ctx.quadraticCurveTo(midX, midY, cx2, cy2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Snake Head at `from` (Head position)
    ctx.font = '22px sans-serif';
    ctx.fillText('🐍', cx1 - 11, cy1 + 8);
}

function getIOSColor(idx) {
    const colors = ['#007aff', '#af52de', '#ff9500', '#ff2d55', '#34c759', '#5856d6'];
    return colors[idx % colors.length];
}
