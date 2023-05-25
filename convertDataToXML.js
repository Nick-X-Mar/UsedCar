const puppeteer = require('puppeteer');
const crypto = require('crypto');
const xmlbuilder = require('xmlbuilder');
const fs = require('fs');

function getIdFromUrl(url) {
    const path = new URL(url).pathname;
    return path.split('/').filter(part => part).pop();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function hashString(input) {
    const hash = crypto.createHash('sha256');
    hash.update(input);
    return "tag_" + hash.digest('hex');
}

async function convertDataToXML(filePath) {
    let browser;
    try {
        const xmlDoc = xmlbuilder.create('cars');
        const data = JSON.parse(fs.readFileSync(filePath));
        const urls = data.urls;
        const max = urls.length;

        let iter = 0
        for (const single_car of urls) {

            let url = single_car.car_url;
            iter = iter + 1;
            console.log(`Processing URL ${iter} of ${max}: ${url}`);
            await sleep(Math.random() * 1000 + 500);
            browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--ignore-certificate-errors'] });
            const page = await browser.newPage();
            await page.goto(url);

            // // Click the consent pop-up's "accept" button
            const consentButtonSelector = '//button/span[contains(text(),"ΣΥΜΦΩΝΩ")]';
            const consentButtons = await page.$x(consentButtonSelector);
            if (consentButtons.length > 0) {
                await consentButtons[0].click();
                // await page.waitForTimeout(5000); // wait for 5 seconds
                await sleep(1500);
            }
            else {
                console.log("No consents button was found")
            }

            let titleText = "";
            let spanXPath = '//*[@id="__layout"]/div/div[5]/div[3]/div/div/div/section/div/div/div/div/div/div[1]/div[2]/div/div[1]/div[1]/div/div/div/h1/div[1]'
            let spanElement = await page.$x(spanXPath);
            if (spanElement.length === 0) {
                // Element not found, continue to the next URL
                console.log("Moving on 1");
                continue;
            }
            try {
                titleText = await page.evaluate(element => element.textContent, spanElement[0]);

                // console.log(titleText);
                if (!titleText) {
                    // Description text is empty, continue to the next URL
                    console.log("Moving on 2");
                    continue;
                }
            } catch (error) {
                // Await failed, continue to the next URL
                console.log("Moving on 3");
                continue;
            }
            const car = xmlDoc.ele('car');
            car.ele('client', data.client)
            car.ele('dealership', data.dealership);
            car.ele('carGrId', getIdFromUrl(single_car.car_url));
            car.ele('carTitle', titleText.replace(/[\s\n]+/g, ' ').trim());
            const fields1 = car.ele('fields1');
            let words = titleText.split(/\s+/).filter(word => word && !/^\d{4}$/.test(word));
            const firstWord = words[0];
            console.log(firstWord);
            const restOfText = words.slice(1).join(' ');
            console.log(restOfText);
            fields1.ele(hashString("Μάρκα"), firstWord);
            fields1.ele(hashString("μοντέλο"), restOfText);

            let subtitleText = "";
            let subspanXPath = '//*[@id="__layout"]/div/div[5]/div[3]/div/div/div/section/div/div/div/div/div/div[1]/div[2]/div/div[1]/div[1]/div/div/div/h1/div[2]'
            let subspanElement = await page.$x(subspanXPath);
            try {
                subtitleText = await page.evaluate(element => element.textContent, subspanElement[0]);
            } catch (error) {
                // Await failed, continue to the next URL
                console.log("No sub-title");
            }
            car.ele('carSubTitle', subtitleText.replace(/[\s\n]+/g, ' ').trim());

            let descriptionText = "";
            // Get Description
            // const spanXPath = '//*[@id="__layout"]/div/div[5]/div/div/div/div/div[1]/div[1]/div[9]/div[2]/div/div[1]/div/span';
            spanXPath = '//*[@id="__layout"]/div/div[5]/div[3]/div/div/div/section/div/div/div/div/div/div[1]/div[1]/div[7]/div[2]/div/div[1]/div/span'
            spanElement = await page.$x(spanXPath);
            try {
                descriptionText = await page.evaluate(element => element.textContent, spanElement[0]);
                // console.log(descriptionText);
            } catch (error) {
                // Await failed, continue to the next URL
                console.log("No desc");
            }

            // Get the tbody element at the given XPath
            const tbodyXPath = '//*[@id="specification-table"]/table/tbody';
            const tbodyElements = await page.$x(tbodyXPath);


            // Extract the text from each second td element inside each tr in the tbody
            const tdTexts = [];
            for (let tbody of tbodyElements) {
                const trs = await tbody.$$('tr');  // Get all tr elements within this tbody
                for (let tr of trs) {
                    const tds = await tr.$$('td'); // Get all td elements within this tr
                    if (tds[0] && tds[1]) { // Check if the first and second td exist
                        // Evaluate both td's innerText at once
                        const [firstTdText, secondTdText] = await Promise.all([
                            page.evaluate(el => el.innerText, tds[0]),
                            page.evaluate(el => el.innerText, tds[1])
                        ]);

                        let text = secondTdText;
                        // if (firstTdText === "Μάρκα - μοντέλο") {
                        //     let words = text.split(' '); // split text into words

                        //     // tdTexts.push(words[0].trim(), words[1].trim());

                        //     fields1.ele(hashString("Μάρκα"), words[0].trim());
                        //     fields1.ele(hashString("μοντέλο"), words[1].trim());
                        // }
                        // else 
                        if (firstTdText === "Χρονολογία ") { // Check the value of the first td
                            const index = text.indexOf('/');
                            if (index !== -1) {
                                text = text.substring(index + 1); // Get only the values after "/"
                            }
                        }
                        // Remove unwanted symbols and text
                        text = text.replace(/€|\(4WD\)|\(FWD\)|g\/km|χλμ|cc|bhp|ίντσες|\./g, "");

                        tdTexts.push(text.trim());
                        fields1.ele(hashString(firstTdText), text.trim());
                        // tdTexts.push(text);
                    }
                }
            }
            // console.log(tdTexts);
            // tdTexts.forEach((value, index) => {
            //     const cleanValue = value.replace(/\n/g, '');
            //     fields1.ele('A' + (index + 1), {}, cleanValue);
            // });

            // Click the first button by its text
            const firstButtonSelector = '//button[contains(text(), "Ιδιαιτερότητες")]';
            const firstButton = await page.$x(firstButtonSelector).then(res => res[0]);
            if (firstButton) {
                await firstButton.click();
            } else {
                console.log("First button not found");
            }

            // Click the second button by its text
            const secondButtonSelector = '//div[contains(text(), "Περισσότερα")]';
            try {
                await sleep(Math.random() * 500 + 500);
                const secondButton = await page.$x(secondButtonSelector).then(res => res[0]);
                if (secondButton) {
                    await secondButton.click();
                } else {
                    console.log("Second button not found");
                }
            } catch (error) {
                console.log("Failed to click the second button:", error);
            }

            // Get the ul element at the given XPath
            // const ulXPath = '//*[@id="__layout"]/div/div[5]/div/div/div/div/div[1]/div[1]/div[5]/div/div/div[2]/div/div/div[1]/ul';
            let ulXPath = '//*[@id="__layout"]/div/div[5]/div[3]/div/div/div/section/div/div/div/div/div/div[1]/div[1]/div[5]/div/div/div[2]/div/div/div[1]/ul'
            const ulElements = await page.$x(ulXPath);

            // Extract the text from each li element inside the ul
            const liTexts = [];
            for (let ul of ulElements) {
                const lis = await ul.$$('li');  // Get all li elements within this ul
                for (let li of lis) {
                    const text = await page.evaluate(el => el.innerText, li);  // Get the inner text of this li
                    liTexts.push(text);
                }
            }

            // console.log(liTexts);



            // const car = xmlDoc.ele('car');
            // const fields1 = car.ele('fields1');
            const fields2 = car.ele('fields2');
            car.ele('desc', descriptionText);
            car.ele('id', iter);
            car.ele('images', single_car.images.join(", "));

            // const images = car.ele('images');
            // single_car.images.forEach((imageURL) => {
            //     images.ele('image', imageURL);
            // });

            // tdTexts.forEach((value, index) => {
            //     const cleanValue = value.replace(/\n/g, '');
            //     fields1.ele('A' + (index + 1), {}, cleanValue);
            // });

            // // Add fields from liTexts to fields2
            // liTexts.forEach((value, index) => {
            //     const cleanValue = value.replace(/\n/g, '');
            //     fields2.ele('B' + (index + 1), {}, cleanValue);
            // });
            // Clean values and create a comma-separated string
            const cleanedLiTexts = liTexts.map(value => value.replace(/\n/g, '')).join(", ");

            // Add the string to fields2
            fields2.ele('txt', cleanedLiTexts);
            await browser.close();
        }

        const xmlString = xmlDoc.end({ pretty: true });
        fs.writeFileSync('output.xml', xmlString);
        console.log('Conversion completed successfully.');
    } catch (error) {
        console.error('An error occurred during conversion:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = convertDataToXML;
