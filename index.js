const Discord = require("discord.js");
const Gamedig = require("gamedig");

const config = require("./config.json")

const bot = new Discord.Client();
bot.login(config.token);

const serverObject = require("./servers.json");

let gData = {}

let frumpyAvatarLink;

let allowedDevs = ["134088598684303360", "204729465564037120"];


bot.on("ready", async () => {
    console.log("Started as " + bot.user.tag);
    bot.user.setActivity("--players in #bot-commands");
    frumpyAvatarLink = bot.users.cache.get("134088598684303360").avatarURL() || "https://i.imgur.com/cBiDnMi.png"

    bot.setInterval(intervalFunction, config.intervalMS)//starts embed update loop

})

async function intervalFunction() {

    // console.time("all")

    await refresh(serverObject);

    bot.channels.cache.get(config.channelID).messages.fetch(config.messageID).then(async m => {//fetches config message
        m.edit("‎", { embed: await makeEmbed() })//sends embed with blank char
    })

    // console.timeEnd("all")

}

async function refresh(servers) {//refreshes all servers

    let allData = {}

    for (let s in servers) {//loops thru servers 
        allData[s] = await getInfo(servers[s])//gets info from server 
    }

    gData = allData;//overwrites Global data var
}

async function getInfo(server) {//gets info for 1 server at a time

    // console.time("server")

    let ip = server.ip.split(":")[0];
    let port = server.ip.split(":")[1];

    let valid = true;

    let res = await Gamedig.query({
        type: "csgo",
        host: ip,
        port: port
    }).catch(e => {
        valid = false;
    })

    let data;

    if (valid) {
        data = {
            online: true,
            name: server.nick,//Short nickname
            fullIP: res.connect,//String with ip:port
            map: res.map,//Current map
            maxPlayers: res.maxplayers,
            players: res.players,//Players array {name, score, time}
            bots: res.bots,//Bots array {name, score, time}
            numPlayers: res.raw.numplayers,//int
            numBots: res.raw.numbots,//int
            show: server.show,//bool to print server in embed
            keywords: server.keywords//array of keywords for --players command
        }
    }
    else {
        data = {
            name: server.nick,
            online: false
        }
    }

    // console.timeEnd("server")

    return data;
}

function makeEmbed() {
    // console.time("embed")
    let embed = new Discord.MessageEmbed()
        .setTitle("Server List")
        .setColor(7980240)
        .setFooter("Last Updated", frumpyAvatarLink)
        .setTimestamp(Date.now())

    for (let s in gData) {//makes field for ever server 
        let server = gData[s];

        if (server.online) {
            embed.addField(
                server.name,
                `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}
                **__Map:__** ${getWebsite(server.map)}
                **__IP:__** ${server.fullIP}`
            )
        } else {//checks if offline
            embed.addField(
                server.name,
                "**Server is not avaiable.**"
            )
        }

    }
    // console.timeEnd("embed")
    return embed;
}

function getWebsite(mapName) {//returns stats website if avaiable 
    //https://snksrv.com/surfstats/?view=map&name=x
    //https://snksrv.com/kzstats/#/maps/x
    if (mapName.startsWith("surf_")) {
        return `[${mapName}](https://snksrv.com/surfstats/?view=map&name=${mapName})`
    } else if (mapName.startsWith("bkz_") || mapName.startsWith("kz_") || mapName.startsWith("kzpro_") || mapName.startsWith("skz_") || mapName.startsWith("vnl_") || mapName.startsWith("xc_")) {
        return `[${mapName}](https://snksrv.com/kzstats/#/maps/${mapName})`
    } else {
        return mapName
    }

}


bot.on('message', async message => {//dev commands

    if (!allowedDevs.includes(message.author.id)) return;//if not frumpy or sneak no commands will run

    const prefix = '--'
    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix)) return;

    if (command == "id") {
        message.channel.send("does sneak gay?").then(m => {
            m.edit(m.id);
        })
    }

    else if (command == "mem") {
        let used = process.memoryUsage();
        let out = "```";
        for (let key in used) {
            out += `${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB\n`
        }
        out += "```"

        message.channel.send(out);
    }
})