import ytsr       from 'ytsr'
import ytDlpExec  from 'yt-dlp-exec'
import Ffmpeg     from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { PassThrough } from 'stream'

Ffmpeg.setFfmpegPath(ffmpegPath)

export async function findYouTubeUrl(songName, artistName) {
  const query   = `${artistName} - ${songName} audio oficial`
  const results = await ytsr(query, { limit: 5 })
  const video   = results.items.find(item => item.type === 'video')

  if (!video) throw new Error(`No se encontró "${songName}" en YouTube`)
  console.log(`YouTube encontrado: ${video.title}`)
  return video.url
}

export async function downloadAudioAsWAV(youtubeUrl) {
  const directUrl = await ytDlpExec(youtubeUrl, {
    format:              'worstaudio/worst',
    getUrl:              true,
    noCheckCertificates: true,
    preferFreeFormats:   true,
  })

  return new Promise((resolve, reject) => {
    const chunks  = []
    const cmd     = Ffmpeg(directUrl.trim())
      .audioChannels(1)
      .audioFrequency(22050)
      .duration(60)
      .format('wav')

    cmd.on('error', err => reject(err))

    cmd.pipe(new PassThrough())
      .on('data',  chunk => chunks.push(chunk))
      .on('end',   ()    => resolve(Buffer.concat(chunks)))
      .on('error', err   => reject(err))
  })
}