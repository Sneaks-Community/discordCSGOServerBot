const Discord = require("discord.js");
const Gamedig = require("gamedig");

const config = require("./config.json")

const bot = new Discord.Client();
bot.login(config.token);

const serverObject = require("./servers.json");


bot.on("ready", async () => {
    console.log("Started as " + bot.user.tag);
    bot.user.setActivity("--players in #bot-commands");
})

async function refresh(servers){
    
}

async function getInfo(server){

    let ip = server.ip.split(":")[0];
    let port = server.ip.split(":")[1];

    let res = await Gamedig.query({
        type: "csgo",
        host: ip,
        port: port
    })

    let data = {
        name: server.nick,//Short nickname
        fullIP: res.connect,//String with ip:port
        map: res.map,//Current map
        maxPlayers: res.raw.maxplayers,
        players: res.players,//Players array {name, score, time}
        bots: res.bots,//Bots array {name, score, time}
        numPlayers: res.raw.numplayers,//int
        numBots: res.raw.numbots,//int
        show: server.show,//bool to print server in embed
        keywords: server.keywords//array of keywords for --players command
    }

    return data;
}

