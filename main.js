function main() {
  const spreadSheetId = PropertiesService.getScriptProperties().getProperty("SPREAD_SHEET_ID");
  const sheetId = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  const webHookUrlLives = PropertiesService.getScriptProperties().getProperty("WEBHOOK_URL_LIVES");
  const webHookUrlMovies = PropertiesService.getScriptProperties().getProperty("WEBHOOK_URL_MOVIES");
  const webHookUrlShorts = PropertiesService.getScriptProperties().getProperty("WEBHOOK_URL_SHORTS");
  const ss = SpreadsheetApp.openById(spreadSheetId);
  const targetSheet = ss.getSheetById(sheetId);
  const data = targetSheet.getDataRange().getValues();
  
  const channelIds = data.slice(1).filter(row => row[2]).map(row => row[2]);
  const preVideoTimeNums = data.slice(1).filter(row => row[5]).map(row => row[5]);

  const videoInfos = getLatestVideoInfos(channelIds);
  if (!videoInfos) return;

  updateSpreadsheet(targetSheet, videoInfos);
  sendDiscordNotifications(webHookUrlLives, webHookUrlMovies, webHookUrlShorts, targetSheet, data, videoInfos, 
  preVideoTimeNums);
}

function getLatestVideoInfos(channelIds) {
  const videoInfos = [];
  try {
    channelIds.forEach(channelId => {
      const channelResponse = YouTube.Channels.list('contentDetails', { id: channelId });
      if (channelResponse.items.length === 0) {
        Logger.log('チャンネルが見つかりません: ' + channelId);
        return;
      }
      const uploadPlaylistId = channelResponse.items[0].contentDetails.relatedPlaylists.uploads;
      const playlistResponse = YouTube.PlaylistItems.list('snippet', { playlistId: uploadPlaylistId, maxResults: 1 });
      if (!playlistResponse || playlistResponse.items.length === 0) {
        Logger.log('プレイリストに動画が見つかりません: ' + channelId);
        return;
      }
      const videoId = playlistResponse.items[0].snippet.resourceId.videoId;
      const videoUrl = 'https://www.youtube.com/watch?v=' + videoId;
      const videoTime = playlistResponse.items[0].snippet.publishedAt;
      const videoTimeNum = formatDate(videoTime);

      const videoResponse = YouTube.Videos.list('contentDetails', { id: videoId });
      const duration = videoResponse.items[0].contentDetails.duration;
      const formattedDuration = formatDuration(duration);

      videoInfos.push({ url: videoUrl, timeNum: videoTimeNum, duration: formattedDuration });
    });
    return videoInfos;
  } catch (error) {
    Logger.log('動画情報取得エラー: ' + error);
    return null;
  }
}

function formatDate(videoTime) {
  const datePart = videoTime.slice(0, 10);
  const timePart = videoTime.slice(11, 19);
  const dateStr = datePart.replace(/-/g, "");
  const timeStr = timePart.replace(/:/g, "");
  return dateStr + timeStr;
}

function formatDuration(duration) {
  const regex = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;
  const matches = duration.match(regex);
  if (!matches) return duration;

  const hours = parseInt(matches[1] || '0', 10);
  const minutes = parseInt(matches[2] || '0', 10);
  const seconds = parseInt(matches[3] || '0', 10);

  return {
    hours: hours,
    minutes: minutes,
    seconds: seconds,
    formatted: `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  };
}

function updateSpreadsheet(targetSheet, videoInfos) {
  urls = [];
  videoInfos.forEach((info, index) => {
    urls.push(info.url);
    targetSheet.getRange(index + 2, 4).setValue(info.url);
    targetSheet.getRange(index + 2, 5).setValue(info.timeNum);
    targetSheet.getRange(index + 2, 7).setValue(info.duration.formatted);
  });
  return urls;
}

function sendDiscordNotifications(webHookUrlLives, webHookUrlMovies, webHookUrlShorts, targetSheet, data, videoInfos, preVideoTimeNums) {
  for (let i = 0; i < videoInfos.length; i++) {
    if (videoInfos[i].timeNum > (preVideoTimeNums[i] || 0)) {
      const row = data.slice(1)[i];
      const messages = createDiscordMessages(row, videoInfos[i].url, i);
      const duration = videoInfos[i].duration;
      const totalSeconds = duration.hours * 3600 + duration.minutes * 60 + duration.seconds;
      let webHookUrl = webHookUrlMovies; // デフォルトはMovies
      if (totalSeconds < 120) {
        webHookUrl = webHookUrlShorts;
      } else if (totalSeconds >= 3000) {
        webHookUrl = webHookUrlLives;
      }
      messages.forEach(message => sendDiscordMessage(webHookUrl, message));
      targetSheet.getRange(i + 2, 6).setValue(videoInfos[i].timeNum);
    }
  }
}

function createDiscordMessages(row, videoUrl, i) {
  const messages = [];
  for (let j = 0; j < row.length; j += 7) {
    if (row[j] && row[j + 1] && row[j + 3]) {
      messages.push({ 
        username: row[j],
        avatar_url: row[j + 1],
        //content: urls[i],
        content: videoUrl,
        tts: false
      });
    }
  }
  return messages;
}

function sendDiscordMessage(webHookUrl, message) {
  try {
    UrlFetchApp.fetch(webHookUrl, {
      method: 'POST',
      headers: { 'Content-type': 'application/json' },
      payload: JSON.stringify(message)
    });
  } catch (error) {
    Logger.log('Discord送信エラー: ' + error);
  }
}

// //参考
// //https://qiita.com/Eai/items/1165d08dce9f183eac74
// //https://discord.com/developers/docs/resources/webhook
// //https://note.com/crefil/n/n2b68b3c4aa6b