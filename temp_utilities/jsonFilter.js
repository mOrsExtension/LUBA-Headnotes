const fs = require('fs');

function filterObjectsByProperty(jsonList, propertyName, outputFileName) {
    // Filter objects that have the specified property
    const filteredObjects = jsonList.filter(obj => obj.hasOwnProperty(propertyName) && obj[propertyName].toLowerCase() != 'unpublished');

    // Save to JSON file
    fs.writeFileSync(outputFileName, JSON.stringify(filteredObjects, null, 2));

    console.log(filteredObjects.length);
}

const convertToList = (file) => {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const main = async ()=>{
    file = await convertToList('luba_opinions_2.json')
    filterObjectsByProperty(file, 'reporter', 'luba_opinions_3.json')
}

main()
