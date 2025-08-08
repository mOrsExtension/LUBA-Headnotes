// CSV -> HTML (temp)
const fs = require('fs');
const csv = require('csv-parser');

const processData = (csvData) => {
    let headName = csvData['HeadName'].trim().replaceAll('\\', "")
    let headNum = csvData['﻿HeadNo'].trim()
    let numMatch = headNum.match(/\.\d/g)
    let headLevel = numMatch ? numMatch.length + 1 : 1
    let headType = ''
    switch (headLevel) {
        case 3:
            headType = 'headnote'
        break;
        case 2:
            headType = 'sub'
        break;
        case 1:
            headType = 'section'
        default:
            break;
    }
    let nameMatch = headName.match(/(?<=\s–\s)[^–]*/g)
    if (nameMatch) {
        nameTail = nameMatch[nameMatch.length-1].trim()
    } else {
        nameTail = headName.trim()
    }
    console.log(`<p class="level-${headLevel}"><span class="${headType}">${headNum}</span> - ${nameTail}</p>`)
}

const getHeadNotes = async () => {
    new Promise((resolve, reject) => {
        const promiseList = []
        fs.createReadStream('HeadnotesList.csv')
            .pipe(csv())
            .on('data', (data) => promiseList.push(processData(data)))
            .on('end', async () => {
                await Promise.all(promiseList);
                resolve()
            });
        })
}

getHeadNotes()