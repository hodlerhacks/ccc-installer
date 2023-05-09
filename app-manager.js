'use strict';

const TelegramBot = require('node-telegram-bot-api');
const configFile = 'config.json';
const config = require(`./${configFile}`);
const shell = require('shelljs');
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
            tgBot.sendMessage(ctx.chat.id, `No apps installed`).catch((e) => { console.log(e) });
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
            }).catch((e) => { console.log(e) });

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
    tgBot.onText(/\/status/, async ctx => {
        if (!validateTelegram(ctx)) return;

        const apps = fetchApplications();

        if (apps.length == 0) {
            tgBot.sendMessage(ctx.chat.id, `No apps installed`).catch((e) => { console.log(e) });
        } else {
            const [code, stdout] = await execShell(`pm2 status`);
            if (code == 0) {
                const result = parsePm2Status(stdout, apps);
                tgBot.sendMessage(ctx.chat.id, result, { parse_mode: 'HTML' }).catch((e) => { console.log(e) });
            }
            else
                await tgBot.sendMessage(ctx.chat.id, `Something went wrong - check console for errors`).catch((e) => { console.log(e) });
        }
    });
}

function handleAppAction(selectedApp, ctx) {
    // Set working directoy for shell commands
    shell.cd(apppath + selectedApp);

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
                    const [code0, stdout0] = await execShell(`pm2 stop ${selectedApp} || true`);
                    const [code1, stdout1] = await execShell(`pm2 start "${main}" --name="${selectedApp}"`);
                    const [code2, stdout2] = await execShell(`pm2 save`);
                    if (code1 + code2 == 0)
                        await tgBot.sendMessage(ctx.chat.id, `Application started`).catch((e) => { console.log(e) });
                    else 
                        await tgBot.sendMessage(ctx.chat.id, `Something went wrong - check console for errors`).catch((e) => { console.log(e) });
                }
            }
            if (selection == 'stop') {
                await tgBot.sendMessage(ctx.chat.id, `Stopping application... please wait`).catch((e) => { console.log(e) });
                const [code, stdout] = await execShell(`pm2 stop ${selectedApp}`);
                if (code == 0)
                    await tgBot.sendMessage(ctx.chat.id, `Application stopped`).catch((e) => { console.log(e) });
                else
                    await tgBot.sendMessage(ctx.chat.id, `Something went wrong - check console for errors`).catch((e) => { console.log(e) });
            }
            if (selection == 'restart') {
                await tgBot.sendMessage(ctx.chat.id, `Restarting application... please wait`).catch((e) => { console.log(e) });
                const [code, stdout] = await execShell(`pm2 restart ${selectedApp}`);
                if (code == 0)
                    await tgBot.sendMessage(ctx.chat.id, `Application restarted`).catch((e) => { console.log(e) });
                else
                    await tgBot.sendMessage(ctx.chat.id, `Something went wrong - check console for errors`).catch((e) => { console.log(e) });
            }
            if (selection == 'install') {
                await tgBot.sendMessage(ctx.chat.id, `Installing application... please wait`).catch((e) => { console.log(e) });
                const [code, stdout] = await execShell(`npm install`);
                if (code == 0)
                    await tgBot.sendMessage(ctx.chat.id, `Installation completed`).catch((e) => { console.log(e) });
                else
                    await tgBot.sendMessage(ctx.chat.id, `Something went wrong - check console for errors`).catch((e) => { console.log(e) });
            }
        });
        tgBot.removeListener("callback_query");
    });
}

function parsePm2Status(stdout, appnames) {
    let apps = [];
    let maxNameLength = 11;
    let maxVersionLength = 7;
    const lines = stdout.split('\n');

    const headers = lines[1];
    const columnNames = headers.split('│').map((name) => name.trim());
    const nameIndex = columnNames.indexOf('name');
    const statusIndex = columnNames.indexOf('status');
    const versionIndex = columnNames.indexOf('version');

    for (let i = 3; i < lines.length; i++) {
        const line = lines[i].trim();
        const columns = line.split('│');

        // if (columns[0].trim() == 'Module') break;
        if (columns.length >= statusIndex && columns.length >= versionIndex) {
            const name = columns[nameIndex].trim();
            const status = columns[statusIndex].trim();
            const version = columns[versionIndex].trim();

            if (appnames.includes(name)) {
                maxNameLength = Math.max(maxNameLength, name.length);
                maxVersionLength = Math.max(maxVersionLength, version.length);
    
                apps.push({
                    name,
                    version, 
                    status,
                });
            }
        }
    }

    const header = {
        name: 'Application',
        version: 'Version',
        status: 'Status',
    };

    let result = '<pre>';
    result += `${header.name.padEnd(maxNameLength + 1, ' ')}| ${header.version.padStart(maxVersionLength, ' ')} | ${header.status}\n`;
    result += `${''.padEnd(maxNameLength + + maxVersionLength + 13, '-')}\n`;

    apps.forEach(app => {
        result += `${app.name.padEnd(maxNameLength + 1, ' ')}| ${app.version.padStart(maxVersionLength, ' ')} | ${app.status}\n`;
    });

    result += '</pre>';

    return result;
}

function validateTelegram(ctx) {
    if (ctx.from.username != config.telegramUsername && '@' + ctx.from.username != config.telegramUsername) {
        tgBot.sendMessage(ctx.chat.id, `Unauthorized user`).catch((err) => { console.log(e) });
        return false;
    }
    return true;
}

async function execShell(cmd) {
    let code = null;
    let stdout;

    shell.exec(cmd, { shell: '/bin/bash', stdio: 'inherit' }, (result, output, stderr) => {
        console.log('Command:', cmd);
        console.log('Exit code:', result);
        code = result;
        stdout = output;
    });

    while (code == null) {
        await sleep(100);
    }

    return [code, stdout];
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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}