const Discord = require("discord.js");
const Gamedig = require("gamedig");

const config = require("./config.json")

const bot = new Discord.Client();
bot.login(config.token);

const serverObject = require("./servers.json");

let gData = {}

let frumpyAvatarLink;


bot.on("ready", async () => {
    console.log("Started as " + bot.user.tag);
    bot.user.setActivity("--players in #bot-commands");
    frumpyAvatarLink = bot.users.cache.get("134088598684303360").avatarURL() || "https://i.imgur.com/cBiDnMi.png"

    bot.setInterval(intervalFunction, config.intervalMS)

})

async function intervalFunction(b){//b for bot object

    

    await refresh(serverObject);

    bot.channels.cache.get(config.channelID).messages.fetch(config.messageID).then(async m => {
        m.edit("‎", {embed: await makeEmbed()})
    })

    

}

async function refresh(servers){
    let allData = {}
    for(let s in servers){//loops thru servers 
        let server = servers[s];

        let data = await getInfo(server)//gets info from server 

        allData[s] = data;//adds to temp obj
    }
    
    gData = allData;//overwrites Global data var
}

async function getInfo(server){

    

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

    if(valid){
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
    else{
        data = {
            name: server.nick,
            online: false
        }
    }

    

    return data;
}

async function makeEmbed(){
    let embed = new Discord.MessageEmbed()
    .setTitle("Server List")
    .setColor(7980240)
    .setFooter("Last Updated", frumpyAvatarLink)
    .setTimestamp(Date.now())

    for(let s in gData){
        let server = gData[s];

        if(server.online){
            embed.addField(
                server.name,
                `**__Players:__** ${server.numPlayers} (${server.numBots}) / ${server.maxPlayers}
                **__Map:__** ${server.map}
                **__IP:__** ${server.fullIP}`//**__Map:__** [${server.map}](https://snksrv.com/surfstats/?view=map&name=${server.map})
            )    
        }else{
            embed.addField(
                server.name,
                "**Server is offline.**"
            )
        }

    }

    return embed;
}


bot.on('message', async message => {
    const prefix = '--'
    const args = message.content.slice(prefix.length).split(/ +/)
    const command = args.shift().toLowerCase()
    if (!message.content.startsWith(prefix)) return;

    if(command == "id"){
        message.channel.send("does sneak gay?").then(m => {
            m.edit(m.id);
        })
    }
})