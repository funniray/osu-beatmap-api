const parser = require('osu-parser');
const AdmZip = require('adm-zip');
const p = require('phin');
const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const cors = require('cors');
const sleep = ms => new Promise(res => setTimeout(res, ms));
const openFile = (path,flags) => new Promise((res,rej) =>{
    fs.access(path,flags,(err,fd) =>{
        if (err)
            rej(err);
        res(fd);
    });
});

let app = express();
let mapsDownloading = new Set();

function getMaps(file) {
    let zip = AdmZip(file);
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
    let diskloc =__dirname+'/tmp/'+id;
    if (mapsDownloading.has(id)) {
        await sleep(5*1000);
        return getFile(id);
    }
    try {
        await openFile(diskloc,fs.constants.F_OK);
    } catch (err) {
        console.log("Downloading map: " + id);
        mapsDownloading.add(id);
        file = await p({url: 'https://bloodcat.com/b/' + id,followRedirects:true});
        if (file.statusCode !== 200) {
            console.log(file.statusCode);
            return;
        }
        fs.mkdirSync(diskloc,{recursive: true});
        fs.writeFileSync(diskloc+"/map.zip",file.body);
        console.log("Finished downloading map: " + id);
        mapsDownloading.delete(id);
    }

    return diskloc+"/map.zip";
}

app.use(cors());

app.get('/:id/maps', async (req,res) => {
    res.set('Content-Type', 'application/json');
    res.send(JSON.stringify(getMaps(await getFile(req.params.id))));
});

app.get('/:id/song.mp3', async (req,res) =>{
    const file = await getFile(req.params.id);
    const maps = getMaps(file);

    if (maps[0] !== undefined) {
        let zip = AdmZip(file);
        res.set('Content-Type','audio/mpeg');
        res.send(zip.getEntry(maps[0].AudioFilename).getData());
    } else {
        res.code(404);
        res.send("Map not found");
    }
});

function tryFile(fileName, zip, res, vol, id) {
    let volume = vol || "1";
    let file = fileName;
    if (zip) {
        zip.extractEntryTo(fileName, "./tmp/" + id, false, true);
        file = "./tmp/" + id + "/" + fileName;
    }
    res.set('Content-Type', 'audio/mpeg');
    ffmpeg(file)
        .on('stderr', function (stderrLine) {
            console.log('Stderr output: ' + stderrLine);
        })
        .audioFilter('volume='+volume)
        .format("mp3")
        .pipe(res, {end: true});
}

app.get('/:id/sounds/:file', async (req,res)=> {
    const file = await getFile(req.params.id);
    let zip = AdmZip(file);
    let fileName = req.params.file.replace(".mp3", ".wav");
    let volume = 1;
    if (fileName.includes("$")) {
        let split = fileName.split("$");
        fileName = split[0]+'.wav';
        volume = Number(split[1].split(".")[0])/100;
    }
    try {
        await tryFile(fileName,zip,res,volume, req.params.id);
    } catch (err) {
        try {
            fileName = fileName.replace(/\d+/g,'');
            await tryFile(fileName,zip,res,volume, req.params.id);
        } catch (err) {
            await tryFile(__dirname+"/defaultsounds/"+fileName.replace('.wav','.mp3'),false,res,volume);
        }
    }
});

app.listen(process.env.PORT || 5000);
