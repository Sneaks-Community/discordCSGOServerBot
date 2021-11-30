//require sqlite3
var sqlite3 = require('sqlite3').verbose();
//create db
var db = new sqlite3.Database('db.sqlite');
//create table called players_follow with columns int discord_id, string map_name, and a unique index on conflict replace
db.run("CREATE TABLE IF NOT EXISTS players_follow (discord_id TEXT, map_name TEXT, UNIQUE(discord_id, map_name) ON CONFLICT REPLACE)");

function followMap(discord_id, map_name) {
    db.run("INSERT INTO players_follow VALUES (?, ?)", [discord_id, map_name]);
}

function unfollowMap(discord_id, map_name) {
    db.run("DELETE FROM players_follow WHERE discord_id = ? AND map_name = ?", [discord_id, map_name]);
}

let getFollowers = function (map_name) {//returns array of discord_ids
    return new Promise(function (resolve, reject) {
        db.all("SELECT discord_id FROM players_follow WHERE map_name = ?", [map_name], function (err, rows) {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}
let getAllFollows = function (callback) {//returns all rows from players_follow
    return new Promise(function (resolve, reject) {
        db.all("SELECT * FROM players_follow", function (err, rows) {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

let getUserFollows = function (discord_id) {//returns array of map_names
    return new Promise(function (resolve, reject) {
        db.all("SELECT map_name FROM players_follow WHERE discord_id = ?", [discord_id], function (err, rows) {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

let isFollowingMap = function (discord_id, map_name) {//returns true if user is following map
    return new Promise(function (resolve, reject) {
        db.get("SELECT * FROM players_follow WHERE discord_id = ? AND map_name = ?", [discord_id, map_name], function (err, row) {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

let getUsersFollowingMap = function (map_name) {//returns array of discord_ids
    return new Promise(function (resolve, reject) {
        db.all("SELECT discord_id FROM players_follow WHERE map_name = ?", [map_name], function (err, rows) {
            if (err) {
                reject(err);
                return;
            }
            resolve(rows);
        });
    });
}

let hasMap = function (map_name) {//returns true if map exists
    return new Promise(function (resolve, reject) {
        db.get("SELECT * FROM players_follow WHERE map_name = ?", [map_name], function (err, row) {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}

let unfollowAll = function (discord_id) {//unfollows all maps for user
    return new Promise(function (resolve, reject) {
        db.run("DELETE FROM players_follow WHERE discord_id = ?", [discord_id], function (err) {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

let totalFollows = function () {//returns total number of follows
    return new Promise(function (resolve, reject) {
        db.get("SELECT COUNT(*) AS total FROM players_follow", function (err, row) {
            if (err) {
                reject(err);
                return;
            }
            resolve(row);
        });
    });
}


//export all functions
module.exports = {
    followMap: followMap,
    unfollowMap: unfollowMap,
    getFollowers: getFollowers,
    getAllFollows: getAllFollows,
    getUserFollows: getUserFollows,
    isFollowingMap: isFollowingMap,
    getUsersFollowingMap: getUsersFollowingMap,
    hasMap: hasMap,
    unfollowAll: unfollowAll
};