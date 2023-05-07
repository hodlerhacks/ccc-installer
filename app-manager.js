'use strict';

const TelegramBot = require('node-telegram-bot-api');
const configFile = 'config.json';
const config = require(`./${configFile}`);
const execSync = require('child_process').execSync;
const fs = require('fs');

const apppath = '/var/opt/';
let tgBot;

initTelegram();

function initTelegram() {
    tgBot = new TelegramBot(config.telegramToken, { polling: true });

    tgBot.onText(/\/app/, async ctx => {
        if (!validateTelegram(ctx)) return;
        tgBot.removeListener("callback_query");

        const apps = fetchApplications();

        if (apps.length == 0) {
            tgBot.sendMessage(ctx.chat.id, `No apps installed`).catch((err) => { telegramError(err) });
        } else if (apps.length == 1) {
            handleAppAction(apps[0], ctx);
        } else {
            let keyboard = [];
            let keyboardRow = [];
            apps.forEach((app, i) => {
                keyboardRow = [];
                keyboardRow.push({
                    text: app,
                    callback_data: app
                });
                keyboard[i] = keyboardRow;
            });
            tgBot.sendMessage(ctx.chat.id, `Which app do you want to manage?`, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }).catch((err) => { telegramError(err) });

            tgBot.on("callback_query", async (callbackQuery) => {
                const selectedApp = callbackQuery.data;
                const ctx = callbackQuery.message;
                tgBot.answerCallbackQuery(callbackQuery.id).then(async () => {
                    handleAppAction(selectedApp, ctx);
                });
                tgBot.removeListener("callback_query");
            });
        }
    });
}

function handleAppAction(selectedApp, ctx) {
    tgBot.sendMessage(ctx.chat.id, `What to do with <b>${selectedApp}</b>?`, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "Start",
                        callback_data: 'start'
                    },
                    {
                        text: "Stop",
                        callback_data: 'stop'
                    },
                    {
                        text: "Restart",
                        callback_data: 'restart'
                    },
                    {
                        text: "Install",
                        callback_data: 'install'
                    },
                ],
            ]
        }
    }).catch((e) => { console.log(e) });
    tgBot.on("callback_query", async (callbackQuery) => {
        const selection = callbackQuery.data;
        const ctx = callbackQuery.message;
        tgBot.answerCallbackQuery(callbackQuery.id).then(async () => {
            if (selection == 'start') {
                // Get entry point from package.json
                const json = await getJson(apppath + selectedApp + '/package.json');
                const main = json.main;
                const mainExists = fs.existsSync(apppath + selectedApp + '/' + main);
                if (!main) {
                    await tgBot.sendMessage(ctx.chat.id, `No main file specified in package.json`).catch((e) => { console.log(e) });
                } else if (!mainExists) {
                    await tgBot.sendMessage(ctx.chat.id, `The main file specified in package.json does not exist`).catch((e) => { console.log(e) });
                } else {
                    await tgBot.sendMessage(ctx.chat.id, `Starting application... please wait`).catch((e) => { console.log(e) });
                    // First stop to avoid duplicate processes running, '|| true' to avoid errors in case no process exists yet
                    try {
                        execSync(`pm2 stop ${selectedApp} || true`, { stdio: 'inherit', cwd: apppath + selectedApp });
                        const output = execSync(`pm2 start "${main}" --name="${selectedApp}"`, { stdio: 'inherit', cwd: apppath + selectedApp });
                        execSync(`pm2 save`, { stdio: 'inherit', cwd: apppath + selectedApp });
                    } catch (e) {
                        console.log('ERROR:', e)
                    }
                    await tgBot.sendMessage(ctx.chat.id, `Application started`).catch((e) => { console.log(e) });
                    await tgBot.sendMessage(ctx.chat.id, output).catch((e) => { console.log(e) });
                }
            }
            if (selection == 'stop') {
                await tgBot.sendMessage(ctx.chat.id, `Stopping application... please wait`).catch((e) => { console.log(e) });
                execSync(`pm2 stop ${selectedApp}`, { stdio: 'inherit', cwd: apppath + selectedApp });
                await tgBot.sendMessage(ctx.chat.id, `Application stopped`).catch((e) => { console.log(e) });
            }
            if (selection == 'restart') {
                await tgBot.sendMessage(ctx.chat.id, `Restarting application... please wait`).catch((e) => { console.log(e) });
                execSync(`pm2 restart ${selectedApp}`, { stdio: 'inherit', cwd: apppath + selectedApp });
                await tgBot.sendMessage(ctx.chat.id, `Application restarted`).catch((e) => { console.log(e) });
            }
            if (selection == 'install') {
                await tgBot.sendMessage(ctx.chat.id, `Installing application... please wait`).catch((e) => { console.log(e) });
                execSync(`npm install`, { stdio: 'inherit', cwd: apppath + selectedApp });
                await tgBot.sendMessage(ctx.chat.id, `Installation completed`).catch((e) => { console.log(e) });
            }
        });
        tgBot.removeListener("callback_query");
    });
}

function validateTelegram(ctx) {
    if (ctx.from.username != config.telegramUsername && '@' + ctx.from.username != config.telegramUsername) {
        tgBot.sendMessage(ctx.chat.id, `Unauthorized user`).catch((err) => { console.log(e) });
        return false;
    }
    return true;
}

function fetchApplications() {
    let apps = [];
    fs.readdirSync(apppath, { withFileTypes: true }).forEach((entry) => {
        if (entry.isDirectory() && entry.name != 'ccc-installer') apps.push(entry.name);
    });
    return apps;
}

async function getJson(file) {
    let json;
    try {
        const data = fs.readFileSync(file, {encoding: 'utf8'});
        json = JSON.parse(data);
    } catch (err) {
        console.log(`Couldn't read JSON file:`, err);
    }
    return json;
}