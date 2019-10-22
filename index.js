const parser = require('osu-parser');
const AdmZip = require('adm-zip');
const p = require('phin');
const express = require('express');

let app = express();
let mapCache = {};

function getMaps(file) {
    let zip = AdmZip(file.body);
    const zipEntries = zip.getEntries();

    let maps = [];
    for (const entry of zipEntries) {
        if(entry.entryName.endsWith('.osu')) {
            const map = parser.parseContent(entry.getData());
            if (map.Mode == 3)
                maps.push(map);
        }
    }
    return maps;
}

async function getFile(id) {
    let file;
    if (mapCache[id] !== undefined) {
        file = mapCache[id];
    } else {
        console.log("Downloading map: " + id);
        file = await p({url: 'https://bloodcat.com/osu/s/' + id});
        console.log("Finished downloading map: " + id);
        if (file.statusCode !== 200) {
            console.log(file.statusCode);
            return;
        }
        mapCache[id] = file;
    }

    return file;
}

app.get('/:id/maps', async (req,res) => {
    res.send(JSON.stringify(getMaps(await getFile(req.params.id))));
});

app.get('/:id/song.mp3', async (req,res) =>{
    const file = await getFile(req.params.id);
    const maps = getMaps(file);

    if (maps[0] !== undefined) {
        let zip = AdmZip(file.body);
        res.send(zip.getEntry(maps[0].AudioFilename).getData());
    } else {
        res.code(404);
        res.send("Map not found");
    }
});

app.listen(process.env.PORT || 5000);