// ES module version with dynamic import for sqlite3
let db = null;

async function initDB() {
    const sqlite3Module = await import('sqlite3');
    const sqlite3 = sqlite3Module.default || sqlite3Module;
    const Database = sqlite3.verbose().Database;
    db = new Database('db.sqlite');
    //create table called players_follow with columns int discord_id, string map_name, and a unique index on conflict replace
    return new Promise((resolve, reject) => {
        db.run("CREATE TABLE IF NOT EXISTS players_follow (discord_id TEXT, map_name TEXT, UNIQUE(discord_id, map_name) ON CONFLICT REPLACE)", function (err) {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

async function followMap(discord_id, map_name) {
    return new Promise((resolve, reject) => {
        db.run("INSERT INTO players_follow VALUES (?, ?)", [discord_id, map_name], function (err) {
            if (err) {
                console.error("Database error in followMap:", err);
                reject(err);
                return;
            }
            resolve();
        });
    });
}

async function unfollowMap(discord_id, map_name) {
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM players_follow WHERE discord_id = ? AND map_name = ?", [discord_id, map_name], function (err) {
            if (err) {
                console.error("Database error in unfollowMap:", err);
                reject(err);
                return;
            }
            resolve();
        });
    });
}

async function getFollowers(map_name) { // returns array of discord_ids
    return new Promise((resolve, reject) => {
        db.all("SELECT discord_id FROM players_follow WHERE map_name = ?", [map_name], function (err, rows) {
            if (err) {
                console.error("Database error in getFollowers:", err);
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

async function getAllFollows() { // returns all rows from players_follow
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM players_follow", function (err, rows) {
            if (err) {
                console.error("Database error in getAllFollows:", err);
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

async function getUserFollows(discord_id) { // returns array of map_names
    return new Promise((resolve, reject) => {
        db.all("SELECT map_name FROM players_follow WHERE discord_id = ?", [discord_id], function (err, rows) {
            if (err) {
                console.error("Database error in getUserFollows:", err);
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

async function isFollowingMap(discord_id, map_name) { // returns true if user is following map
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM players_follow WHERE discord_id = ? AND map_name = ?", [discord_id, map_name], function (err, row) {
            if (err) {
                console.error("Database error in isFollowingMap:", err);
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

async function getUsersFollowingMap(map_name) { // returns array of discord_ids
    return new Promise((resolve, reject) => {
        db.all("SELECT discord_id FROM players_follow WHERE map_name = ?", [map_name], function (err, rows) {
            if (err) {
                console.error("Database error in getUsersFollowingMap:", err);
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

async function hasMap(map_name) { // returns true if map exists
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM players_follow WHERE map_name = ?", [map_name], function (err, row) {
            if (err) {
                console.error("Database error in hasMap:", err);
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

async function unfollowAll(discord_id) { // unfollows all maps for user
    return new Promise((resolve, reject) => {
        db.run("DELETE FROM players_follow WHERE discord_id = ?", [discord_id], function (err) {
            if (err) {
                console.error("Database error in unfollowAll:", err);
                reject(err);
                return;
            }
            resolve();
        });
    });
}

async function totalFollows() { // returns total number of follows
    return new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) AS total FROM players_follow", function (err, row) {
            if (err) {
                console.error("Database error in totalFollows:", err);
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

export {
    initDB,
    followMap,
    unfollowMap,
    getFollowers,
    getAllFollows,
    getUserFollows,
    isFollowingMap,
    getUsersFollowingMap,
    hasMap,
    unfollowAll,
    totalFollows
};