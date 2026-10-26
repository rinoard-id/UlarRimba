const express = require('http') ? require('express') : null; // standard require
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = require('express')();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 4000;

app.use(require('express').static(path.join(__dirname, 'public')));

// Initialize SQLite database
const dbFile = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            avatar_id INTEGER DEFAULT 1,
            mmr_points INTEGER DEFAULT 100,
            total_wins INTEGER DEFAULT 0,
            total_matches INTEGER DEFAULT 0
        )`, (err) => {
            if (err) console.error("Error creating players table:", err);
        });
    }
});

// Helper for MMR rank title
function getRankTitle(mmr) {
    if (mmr < 500) return 'Beginner';
    if (mmr < 1000) return 'Intermediate';
    if (mmr < 1500) return 'Advanced';
    if (mmr < 2000) return 'Pro';
    return 'Legend';
}

// 60 Fate Cards (30 Green, 30 Red)
const GREEN_CARDS = [
    { id: 1, text: "Maju 3 kotak", type: 'green', action: (player, state) => { player.pos += 3; } },
    { id: 2, text: "Maju = Dadu x2", type: 'green', action: (player, state, dice) => { player.pos += (dice * 2); } },
    { id: 3, text: "Teleportasi ke Tangga Terdekat", type: 'green', action: (player, state) => { 
        let nextLadder = state.ladders.find(l => l.from > player.pos);
        if (nextLadder) player.pos = nextLadder.to;
        else player.pos += 5;
    } },
    { id: 4, text: "Tukar Posisi dengan Terdepan", type: 'green', action: (player, state, _, allPlayers) => {
        let leader = allPlayers.reduce((max, p) => p.pos > max.pos ? p : max, allPlayers[0]);
        if (leader.id !== player.id) {
            let temp = player.pos; player.pos = leader.pos; leader.pos = temp;
        }
    } },
    { id: 5, text: "Perisai Hewan (Kebal 1 Trap)", type: 'green', action: (player) => { player.shield = true; } },
    { id: 6, text: "Ekstra Dadu (Lempar lagi)", type: 'green', action: (player, state, dice, all, callback) => { if(callback) callback('extra_turn', player); } },
    { id: 7, text: "Pengawal (+1 kotak ekstra)", type: 'green', action: (player) => { player.pos += 1; } },
    { id: 8, text: "Lompat ke Genap Terdekat", type: 'green', action: (player) => { 
        while(player.pos < 100 && player.pos % 2 !== 0) player.pos++;
    } },
    { id: 9, text: "Bebas Pilih Dadu (1-6)", type: 'green', action: (player, state, dice, all, cb, socket) => { if(cb) cb('choose_dice', player); } },
    { id: 10, text: "Tarik Pemain Belakang ke Posismu", type: 'green', action: (player, state, dice, allPlayers) => {
        let trailers = allPlayers.filter(p => p.id !== player.id && p.pos < player.pos);
        trailers.forEach(p => p.pos = player.pos);
    } },
    { id: 11, text: "Kebal Kartu Merah (2 Turn)", type: 'green', action: (player) => { player.redImmunity = 2; } },
    { id: 12, text: "Teleport +10 Kotak", type: 'green', action: (player) => { player.pos += 10; } },
    { id: 13, text: "Sejajarkan Posisi dengan Terdepan", type: 'green', action: (player, state, dice, allPlayers) => {
        let leader = allPlayers.reduce((max, p) => p.pos > max.pos ? p : max, allPlayers[0]);
        player.pos = leader.pos;
    } },
    { id: 14, text: "Naik 1 Baris (+10)", type: 'green', action: (player) => { player.pos += 10; } },
    { id: 15, text: "Simpan Kartu Penangkal Merah", type: 'green', action: (player) => { player.savedShieldCard = true; } },
    { id: 16, text: "Lempar 2 Dadu Sekaligus", type: 'green', action: (player, state, dice, all, cb) => { if(cb) cb('double_dice', player); } },
    { id: 17, text: "Maju 5 Kotak Bebas Trap", type: 'green', action: (player) => { player.pos += 5; player.ignoreTraps = true; } },
    { id: 18, text: "Pawang Hewan (Hewan jadi Naik)", type: 'green', action: (player) => { player.tamer = true; } },
    { id: 19, text: "Copy Dadu Lawan Sebelumnya", type: 'green', action: (player, state, dice) => { player.pos += (state.lastDice || 3); } },
    { id: 20, text: "Lompat ke Kelipatan 10 Terdekat", type: 'green', action: (player) => {
        while(player.pos < 100 && player.pos % 10 !== 0) player.pos++;
    } },
    { id: 21, text: "Kebal Tukar Posisi (3 Turn)", type: 'green', action: (player) => { player.swapImmunity = 3; } },
    { id: 22, text: "Dorong Lawan Terdepan Mundur 2", type: 'green', action: (player, state, dice, allPlayers) => {
        let leader = allPlayers.reduce((max, p) => p.pos > max.pos ? p : max, allPlayers[0]);
        if(leader.id !== player.id) leader.pos = Math.max(1, leader.pos - 2);
    } },
    { id: 23, text: "Jalan Tol (+3 Kotak)", type: 'green', action: (player) => { player.pos += 3; } },
    { id: 24, text: "Sapu Bersih Kotak Sama (-3 Musuh)", type: 'green', action: (player, state, dice, allPlayers) => {
        allPlayers.forEach(p => { if(p.id !== player.id && p.pos === player.pos) p.pos = Math.max(1, p.pos - 3); });
    } },
    { id: 25, text: "Maju 1 & Ambil Kartu Lagi", type: 'green', action: (player, state, dice, all, cb) => { player.pos += 1; if(cb) cb('draw_again', player); } },
    { id: 26, text: "Shortcut ke Petak 50 (Jika < 50)", type: 'green', action: (player) => { if(player.pos < 50) player.pos = 50; else player.pos += 5; } },
    { id: 27, text: "Curi Giliran Lawan (Extra Turn)", type: 'green', action: (player, state, dice, all, cb) => { if(cb) cb('extra_turn', player); } },
    { id: 28, text: "Ubah Trap Terdekat jadi Tangga", type: 'green', action: (player, state) => {
        let trap = state.snakes.find(s => s.from > player.pos);
        if(trap) {
            state.snakes = state.snakes.filter(s => s !== trap);
            state.ladders.push({ from: trap.from, to: trap.to });
        } else {
            player.pos += 4;
        }
    } },
    { id: 29, text: "Guaranteed High Dadu (Next Turn 6)", type: 'green', action: (player) => { player.nextDiceSix = true; } },
    { id: 30, text: "Berdiri 1 Kotak di Belakang Terdepan", type: 'green', action: (player, state, dice, allPlayers) => {
        let leader = allPlayers.reduce((max, p) => p.pos > max.pos ? p : max, allPlayers[0]);
        player.pos = Math.max(1, leader.pos - 1);
    } }
];

const RED_CARDS = [
    { id: 1, text: "Mundur 3 kotak", type: 'red', action: (player) => { if(!player.redImmunity) player.pos = Math.max(1, player.pos - 3); } },
    { id: 2, text: "Mundur = Dadu Sebelumnya", type: 'red', action: (player, state) => { if(!player.redImmunity) player.pos = Math.max(1, player.pos - (state.lastDice || 2)); } },
    { id: 3, text: "Jatuh ke Hewan Ganas Terdekat", type: 'red', action: (player, state) => {
        if(player.redImmunity || player.shield) { player.shield = false; return; }
        let prevSnake = state.snakes.slice().reverse().find(s => s.from < player.pos);
        if(prevSnake) player.pos = prevSnake.to;
        else player.pos = Math.max(1, player.pos - 5);
    } },
    { id: 4, text: "Tukar Posisi dengan Terbelakang", type: 'red', action: (player, state, dice, allPlayers) => {
        if(player.swapImmunity > 0) return;
        let trailer = allPlayers.reduce((min, p) => p.pos < min.pos ? p : min, allPlayers[0]);
        if(trailer.id !== player.id) {
            let temp = player.pos; player.pos = trailer.pos; trailer.pos = temp;
        }
    } },
    { id: 5, text: "Kena Begal (-5 & Skip Turn)", type: 'red', action: (player) => {
        if(!player.redImmunity) { player.pos = Math.max(1, player.pos - 5); player.skipTurn = true; }
    } },
    { id: 6, text: "Freeze (Skip 1 Turn)", type: 'red', action: (player) => { if(!player.redImmunity) player.skipTurn = true; } },
    { id: 7, text: "Dadu Minus 2 (Next Turn)", type: 'red', action: (player) => { player.diceMinus = 2; } },
    { id: 8, text: "Terlempar Mundur 10 Kotak", type: 'red', action: (player) => { if(!player.redImmunity) player.pos = Math.max(1, player.pos - 10); } },
    { id: 9, text: "Jalan Mundur di Turn Berikutnya", type: 'red', action: (player) => { player.reverseWalk = true; } },
    { id: 10, text: "Tarik Depan Ikut Mundur", type: 'red', action: (player) => { if(!player.redImmunity) player.pos = Math.max(1, player.pos - 4); } },
    { id: 11, text: "Lempar ke Petak Awal (jika < 20)", type: 'red', action: (player) => { if(player.pos < 20 && !player.redImmunity) player.pos = 1; } },
    { id: 12, text: "Harus Dadu Genap Baru Bisa Jalan", type: 'red', action: (player) => { player.needEven = true; } },
    { id: 13, text: "Turun 1 Baris (-10)", type: 'red', action: (player) => { if(!player.redImmunity) player.pos = Math.max(1, player.pos - 10); } },
    { id: 14, text: "Dadu Maksimal 3", type: 'red', action: (player) => { player.maxDice = 3; } },
    { id: 15, text: "Lumpur (Must Roll 6 to Exit)", type: 'red', action: (player) => { player.inMud = true; } },
    { id: 16, text: "Swap dengan Pemain di Belakangmu", type: 'red', action: (player, state, dice, allPlayers) => {
        if(player.swapImmunity > 0) return;
        let behind = allPlayers.filter(p => p.pos < player.pos);
        if(behind.length > 0) {
            let target = behind[Math.floor(Math.random() * behind.length)];
            let temp = player.pos; player.pos = target.pos; target.pos = temp;
        }
    } },
    { id: 17, text: "Mundur ke Ganjil Terdekat", type: 'red', action: (player) => { while(player.pos > 1 && player.pos % 2 === 0) player.pos--; } },
    { id: 18, text: "Efek Domino (Tabrak Lawan -2)", type: 'red', action: (player, state, dice, allPlayers) => {
        player.pos = Math.max(1, player.pos - 2);
        allPlayers.forEach(p => { if(p.id !== player.id && p.pos === player.pos) p.pos = Math.max(1, p.pos - 2); });
    } },
    { id: 19, text: "Rugi Massal (Semua Pemain -2)", type: 'red', action: (player, state, dice, allPlayers) => {
        allPlayers.forEach(p => p.pos = Math.max(1, p.pos - 2));
    } },
    { id: 20, text: "Hipnosis (Arah Dibalik)", type: 'red', action: (player) => { player.reverseWalk = true; } },
    { id: 21, text: "Langkah Berat (Cuma Boleh +1)", type: 'red', action: (player) => { player.heavyStep = true; } },
    { id: 22, text: "Mundur ke Kelipatan 5 Terdekat", type: 'red', action: (player) => { while(player.pos > 1 && player.pos % 5 !== 0) player.pos--; } },
    { id: 23, text: "Draw 1 Kartu Merah Lagi", type: 'red', action: (player, state, dice, all, cb) => { if(cb) cb('draw_red', player); } },
    { id: 24, text: "Mundur 2 & Hangus Item", type: 'red', action: (player) => { player.pos = Math.max(1, player.pos - 2); player.shield = false; } },
    { id: 25, text: "Sumpah Dadu (Pasti 1-3)", type: 'red', action: (player) => { player.badDice = true; } },
    { id: 26, text: "Gravitasi (Dadu 6 Dilarang Jalan)", type: 'red', action: (player) => { player.noSix = true; } },
    { id: 27, text: "Perangkap Massal (Tarik Semua ke Kotakmu)", type: 'red', action: (player, state, dice, allPlayers) => {
        allPlayers.forEach(p => { if(p.id !== player.id) p.pos = player.pos; });
    } },
    { id: 28, text: "Reset ke Checkpoint Terdekat (25/50/75)", type: 'red', action: (player) => {
        if(player.pos > 75) player.pos = 75;
        else if(player.pos > 50) player.pos = 50;
        else if(player.pos > 25) player.pos = 25;
        else player.pos = 1;
    } },
    { id: 29, text: "Dadu Bagi 2 (Bulatkan Bawah)", type: 'red', action: (player, state, dice) => { player.pos += Math.floor((dice || 4) / 2); } },
    { id: 30, text: "Lempar Mundur 8 (jika sisa 5 ke Finish)", type: 'red', action: (player) => { if(player.pos >= 95) player.pos -= 8; } }
];

// Active Rooms
const rooms = {};

// Procedural Board Generator
function generateBoard() {
    let snakes = [];
    let ladders = [];
    let cardTiles = [];

    // 10 rows (1-10, 11-20, ..., 91-100)
    for (let r = 0; r < 10; r++) {
        let rowStart = r * 10 + 1;
        let rowEnd = rowStart + 9;
        if (r === 0 || r === 9) continue; // Skip start & finish rows for heavy traps

        // Random snakes (1 to 3 per row)
        let numSnakes = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < numSnakes; i++) {
            let from = Math.floor(Math.random() * 8) + rowStart + 1;
            let to = Math.floor(Math.random() * (rowStart - 1)) + 1;
            if (to < 1) to = 1;
            if (from > to && !snakes.some(s => s.from === from)) {
                snakes.push({ from, to });
            }
        }

        // Random ladders (1 to 3 per row)
        let numLadders = Math.floor(Math.random() * 2) + 1;
        for (let i = 0; i < numLadders; i++) {
            let from = Math.floor(Math.random() * 8) + rowStart;
            let to = from + Math.floor(Math.random() * 20) + 10;
            if (to > 99) to = 99;
            if (from < to && !ladders.some(l => l.from === from) && !snakes.some(s => s.from === from)) {
                ladders.push({ from, to });
            }
        }
    }

    // Generate 12-15 Fate Card tiles randomly (between 2 and 98)
    let cardCount = Math.floor(Math.random() * 4) + 12; // 12 to 15
    while (cardTiles.length < cardCount) {
        let tile = Math.floor(Math.random() * 97) + 2;
        if (!cardTiles.includes(tile) && !snakes.some(s => s.from === tile) && !ladders.some(l => l.from === tile)) {
            cardTiles.push(tile);
        }
    }

    return { snakes, ladders, cardTiles };
}

io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    // Register / Login Player in SQLite
    socket.on('login_player', (data) => {
        let username = data.username ? data.username.trim() : `Player_${Math.floor(Math.random()*1000)}`;
        let avatarId = data.avatar_id || 1;

        db.get(`SELECT * FROM players WHERE username = ?`, [username], (err, row) => {
            if (err) {
                socket.emit('login_response', { success: false, message: 'Database error' });
                return;
            }
            if (row) {
                socket.emit('login_response', { success: true, player: row, rank: getRankTitle(row.mmr_points) });
            } else {
                db.run(`INSERT INTO players (username, avatar_id, mmr_points, total_wins, total_matches) VALUES (?, ?, 100, 0, 0)`, [username, avatarId], function(err) {
                    if (err) {
                        socket.emit('login_response', { success: false, message: 'Username already taken or invalid' });
                    } else {
                        db.get(`SELECT * FROM players WHERE id = ?`, [this.lastID], (err, newRow) => {
                            socket.emit('login_response', { success: true, player: newRow, rank: getRankTitle(newRow.mmr_points) });
                        });
                    }
                });
            }
        });
    });

    // Get Leaderboard
    socket.on('get_leaderboard', () => {
        db.all(`SELECT username, avatar_id, mmr_points, total_wins, total_matches FROM players ORDER BY mmr_points DESC LIMIT 10`, [], (err, rows) => {
            if (!err) {
                let ranked = rows.map(r => ({ ...r, rank: getRankTitle(r.mmr_points) }));
                socket.emit('leaderboard_data', ranked);
            }
        });
    });

    // Create Room Online
    socket.on('create_room', (data) => {
        let roomCode = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomCode] = {
            code: roomCode,
            host: socket.id,
            players: [{
                id: socket.id,
                username: data.username,
                avatar: data.avatar || 1,
                pos: 1,
                isBot: false,
                skipTurn: false,
                shield: false,
                redImmunity: 0,
                swapImmunity: 0
            }],
            board: generateBoard(),
            turnIndex: 0,
            status: 'waiting', // waiting, playing, finished
            winner: null
        };
        socket.join(roomCode);
        socket.emit('room_joined', { roomCode, room: rooms[roomCode] });
    });

    // Join Room Online
    socket.on('join_room', (data) => {
        let roomCode = data.roomCode;
        let room = rooms[roomCode];
        if (!room) {
            socket.emit('error_message', 'Room tidak ditemukan!');
            return;
        }
        if (room.status !== 'waiting') {
            socket.emit('error_message', 'Permainan sudah dimulai!');
            return;
        }
        if (room.players.length >= 4) {
            socket.emit('error_message', 'Room sudah penuh (Maks 4 player)!');
            return;
        }

        room.players.push({
            id: socket.id,
            username: data.username,
            avatar: data.avatar || 1,
            pos: 1,
            isBot: false,
            skipTurn: false,
            shield: false,
            redImmunity: 0,
            swapImmunity: 0
        });

        socket.join(roomCode);
        io.to(roomCode).emit('room_update', room);
    });

    // Start Online Game
    socket.on('start_game', (roomCode) => {
        let room = rooms[roomCode];
        if (room && room.host === socket.id) {
            room.status = 'playing';
            io.to(roomCode).emit('game_started', room);
        }
    });

    // Roll Dice (Online & Local/Solo handler)
    socket.on('roll_dice', (data) => {
        let roomCode = data.roomCode;
        let room = rooms[roomCode];
        if (!room || room.status !== 'playing') return;

        let currentPlayer = room.players[room.turnIndex];
        if (currentPlayer.id !== socket.id && !currentPlayer.isBot) return;

        if (currentPlayer.skipTurn) {
            currentPlayer.skipTurn = false;
            room.turnIndex = (room.turnIndex + 1) % room.players.length;
            io.to(roomCode).emit('game_state_update', room);
            return;
        }

        let dice = Math.floor(Math.random() * 6) + 1;
        room.lastDice = dice;

        // Modifiers
        if (currentPlayer.maxDice && dice > currentPlayer.maxDice) dice = currentPlayer.maxDice;
        if (currentPlayer.diceMinus) { dice = Math.max(1, dice - currentPlayer.diceMinus); currentPlayer.diceMinus = 0; }
        if (currentPlayer.nextDiceSix) { dice = 6; currentPlayer.nextDiceSix = false; }
        if (currentPlayer.badDice) { dice = Math.floor(Math.random() * 3) + 1; currentPlayer.badDice = false; }

        let oldPos = currentPlayer.pos;
        let targetPos = oldPos + dice;

        // Exact 100 win rule with bounce back
        if (targetPos > 100) {
            let excess = targetPos - 100;
            targetPos = 100 - excess;
        }

        currentPlayer.pos = targetPos;

        // Check Snakes / Animals
        let snakeHit = room.board.snakes.find(s => s.from === currentPlayer.pos);
        let ladderHit = room.board.ladders.find(l => l.from === currentPlayer.pos);
        let cardHit = room.board.cardTiles.includes(currentPlayer.pos);

        let eventMessage = `${currentPlayer.username} melempar dadu [${dice}] -> Petak ${targetPos}`;
        let triggeredCard = null;

        if (snakeHit) {
            if (currentPlayer.shield) {
                currentPlayer.shield = false;
                eventMessage += ` | Perisai menahan Hewan Ganas di Petak ${snakeHit.from}!`;
            } else if (currentPlayer.tamer) {
                currentPlayer.tamer = false;
                currentPlayer.pos = snakeHit.to > snakeHit.from ? snakeHit.to : snakeHit.from + 5;
                eventMessage += ` | Pawang Hewan mengubah Trap jadi bonus!`;
            } else {
                currentPlayer.pos = snakeHit.to;
                eventMessage += ` | Terkena Hewan Ganas! Turun ke Petak ${snakeHit.to}`;
            }
        } else if (ladderHit) {
            currentPlayer.pos = ladderHit.to;
            eventMessage += ` | Menemukan Pemanjat! Naik ke Petak ${ladderHit.to}`;
        } else if (cardHit) {
            // Draw Fate Card (Green or Red 50:50)
            let isGreen = Math.random() < 0.5;
            let deck = isGreen ? GREEN_CARDS : RED_CARDS;
            let card = deck[Math.floor(Math.random() * deck.length)];
            triggeredCard = card;

            // Execute card action
            card.action(currentPlayer, room, dice, room.players, (actionType, target) => {
                // Callback for extra turn or specific actions
                if(actionType === 'extra_turn') {
                    room.turnIndex = (room.turnIndex - 1 + room.players.length) % room.players.length;
                }
            }, socket);

            eventMessage += ` | Kartu Takdir [${isGreen ? 'HIJAU' : 'MERAH'}]: ${card.text}`;
        }

        // Check Win Condition
        if (currentPlayer.pos === 100) {
            room.status = 'finished';
            room.winner = currentPlayer;

            // Update MMR in database if registered players
            db.get(`SELECT * FROM players WHERE username = ?`, [currentPlayer.username], (err, row) => {
                if (row) {
                    let newMmr = row.mmr_points + 40;
                    db.run(`UPDATE players SET mmr_points = ?, total_wins = total_wins + 1, total_matches = total_matches + 1 WHERE username = ?`, [newMmr, currentPlayer.username]);
                }
            });

            io.to(roomCode).emit('game_over', { room, winner: currentPlayer, message: `${currentPlayer.username} MENANG SEBAGAI JUARA RIMBA!` });
            return;
        }

        // Advance Turn
        room.turnIndex = (room.turnIndex + 1) % room.players.length;

        io.to(roomCode).emit('dice_rolled', {
            room,
            dice,
            currentPlayer,
            eventMessage,
            triggeredCard
        });
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        // Clean up rooms if needed or handle host leave
        for (let code in rooms) {
            rooms[code].players = rooms[code].players.filter(p => p.id !== socket.id);
            if (rooms[code].players.length === 0) {
                delete rooms[code];
            } else if (rooms[code].host === socket.id) {
                rooms[code].host = rooms[code].players[0].id;
                io.to(code).emit('room_update', rooms[code]);
            }
        }
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server Ular Tangga Rimba berjalan di port ${PORT}`);
    console.log(`Akses lokal: http://localhost:${PORT}`);
});
