const parser = require('osu-parser');
const AdmZip = require('adm-zip');
const p = require('phin');
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const uuid = require('uuid/v4');
const sleep = ms => new Promise(res => setTimeout(res, ms))

let app = express();
let mapCache = {};
let mapsDownloading = new Set();

function getMaps(file) {
    let zip = AdmZip(file.body);
    const zipEntries = zip.getEntries();

    let maps = [];
    for (const entry of zipEntries) {
        if(entry.entryName.endsWith('.osu')) {
            const map = parser.parseContent(entry.getData());
            maps.push(map);
        }
    }
    return maps;
}

async function getFile(id) {
    let file;
    if (mapsDownloading.has(id)) {
        await sleep(10*1000);
        return getFile(id);
    }
    if (mapCache[id] !== undefined) {
        file = mapCache[id];
    } else {
        console.log("Downloading map: " + id);
        mapsDownloading.add(id);
        file = await p({url: 'https://bloodcat.com/osu/s/' + id});
        console.log("Finished downloading map: " + id);
        mapCache[id] = file;
        mapsDownloading.delete(id);
        if (file.statusCode !== 200) {
            console.log(file.statusCode);
            return;
        }
    }

    return file;
}

app.get('/:id/maps', async (req,res) => {
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(getMaps(await getFile(req.params.id))));
});

app.get('/:id/song.mp3', async (req,res) =>{
    const file = await getFile(req.params.id);
    const maps = getMaps(file);

    if (maps[0] !== undefined) {
        let zip = AdmZip(file.body);
        res.set('Content-Type','audio/mpeg');
        res.send(zip.getEntry(maps[0].AudioFilename).getData());
    } else {
        res.code(404);
        res.send("Map not found");
    }
});

function tryFile(fileName, zip, res) {
    const fuuid = uuid();
    zip.extractEntryTo(fileName, "./tmp/" + fuuid, false, true);
    res.set('Content-Type', 'audio/mpeg');
    ffmpeg("./tmp/" + fuuid + "/" + fileName)
        .on('stderr', function (stderrLine) {
            console.log('Stderr output: ' + stderrLine);
        })
        .format("mp3")
        .pipe(res, {end: true});
}

app.get('/:id/sounds/:file', async (req,res)=> {
    const file = await getFile(req.params.id);
    let zip = AdmZip(file.body);
    let fileName = req.params.file.replace(".mp3", ".wav");
    try {
        await tryFile(fileName,zip,res);
    } catch (err) {
        try {
            fileName = fileName.replace(/\d+/g,'');
            await tryFile(fileName,zip,res);
        } catch (err) {
            res.sendFile(__dirname+"/defaultsounds/"+fileName.replace('.wav','.mp3'));
        }
    }
});

app.listen(process.env.PORT || 5000);