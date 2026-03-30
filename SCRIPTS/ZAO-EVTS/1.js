module.exports.config = {
  name: "0joinNoti_0",
  eventType: ["log:subscribe"],
  version: "1.0.1",
  credits: "MrTomXxX",
  description: "Notify bot or group member with random gif/photo/video",
  dependencies: {
    "fs-extra": "",
    "path": ""
  }
};

module.exports.onLoad = function () {
    const { existsSync, mkdirSync } = global.nodemodule["fs-extra"];
    const { join } = global.nodemodule["path"];

  const path = join(__dirname, "cache", "joinGif");
  if (existsSync(path)) mkdirSync(path, { recursive: true });	

  const path2 = join(__dirname, "cache", "joinGif", "randomgif");
    if (!existsSync(path2)) mkdirSync(path2, { recursive: true });

    return;
}


module.exports.run = async function({ api, event, Users, Threads }) {
    const { join } = global.nodemodule["path"];
  const { threadID } = event;
  if (event.logMessageData.addedParticipants.some(i => i.userFbId == api.getCurrentUserID())) {
    api.changeNickname(`» ${global.config.PREFIX} « → ${(!global.config.BOTNAME) ? "LegendSam 𝙊𝙛𝙛𝙞𝙘𝙞𝙖𝙡 𝘽𝙤𝙩<3" : global.config.BOTNAME}`, threadID, api.getCurrentUserID());
    return api.sendMessage(`▂▃▅▆𝐋𝐨𝐚𝐝𝐢𝐧𝐠...𝟏𝟎𝟎%▆▅▃▂\n\n\n تِٰـِۢسِٰـِۢجِٰـِۢيِٰـِۢل ډِٰخِٰـِۢﯛل ﭑِٰࢦِٰـِۢفِٰـِۢخِٰـِۢﭑِٰمِٰـِۢة شِٰـِۢخِٰـِۢصِٰـِۢيِٰـِۢﭑِٰ عِٰـِۢࢦِٰـِۢئ ﭑِٰࢦِٰـِۢجِٰـِۢمِٰـِۢيِٰـِۢع ﭑِٰࢦِٰـِۢخِٰـِۢضِٰـِۢﯛع😈💥🔥 `, threadID);
  }
  else {
    try {
      const { createReadStream, existsSync, mkdirSync, readdirSync } = global.nodemodule["fs-extra"];
        const moment = require("moment-timezone");
  const time = moment.tz("Asia/Dhaka").format("DD/MM/YYYY || HH:mm:s");
  const hours = moment.tz("Asia/Dhaka").format("HH");
      let { threadName, participantIDs } = await api.getThreadInfo(threadID);
      const threadData = global.data.threadData.get(parseInt(threadID)) || {};
      const path = join(__dirname, "cache", "joinGif");
      const pathGif = join(path, `join.mp4`);

      var mentions = [], nameArray = [], memLength = [], i = 0;

      for (id in event.logMessageData.addedParticipants) {
        const userName = event.logMessageData.addedParticipants[id].fullName;
        nameArray.push(userName);
        mentions.push({ tag: userName, id });
        memLength.push(participantIDs.length - i++);
      }
      memLength.sort((a, b) => a - b);

      (typeof threadData.customJoin == "undefined") ? msg = "": msg = threadData.customJoin;
      msg = msg
                .replace(/\{name}/g, nameArray.join(''))
                .replace(/\{type}/g, (memLength.length > 1) ? '𝙎𝙪𝙣𝙤' : '𝙏𝙪𝙢')
                .replace(/\{soThanhVien}/g, memLength.join(', '))
                .replace(/\{threadName}/g, threadName)
                .replace(/\{session}/g, hours <= 10 ? "𝙈𝙤𝙧𝙣𝙞𝙣𝙜" : 
    hours > 10 && hours <= 12 ? "𝘼𝙛𝙩𝙚𝙧𝙉𝙤𝙤𝙣" :
    hours > 12 && hours <= 18 ? "𝙀𝙫𝙚𝙣𝙞𝙣𝙜" : "𝙉𝙞𝙜𝙝𝙩")
                .replace(/\{time}/g, time);  



      if (existsSync(path)) mkdirSync(path, { recursive: true });

      const randomPath = readdirSync(join(__dirname, "cache", "joinGif", "randomgif"));

      if (existsSync(pathGif)) formPush = { body: msg, attachment: createReadStream(pathGif), mentions }
      else if (randomPath.length != 0) {
        const pathRandom = join(__dirname, "cache", "joinGif", "randomgif", `${randomPath[Math.floor(Math.random() * randomPath.length)]}`);
        formPush = { body: msg, attachment: createReadStream(pathRandom), mentions }
      }
      else formPush = { body: msg, mentions }

      return api.sendMessage(formPush, threadID);

    } catch (e) { return console.log(e) };
  }
                       }