import { app, ipcMain, dialog } from "electron";
import types from "../../common/ipcTypes";
import logger from "../../common/logger";
import configManager from "../config";
import hooker from "../hooker";
import Game from "../game";
import TranslatorWindow from "../translatorWindow";
import TranslationManager from "../translate/translationManager";

let runningGame: Game;
let translatorWindow: TranslatorWindow | null;

export default function(mainWindow: Electron.BrowserWindow) {
  ipcMain.on(types.MAIN_PAGE_LOAD_FINISHED, () => {
    logger.info(`main page load finished.`);
    TranslationManager.getInstance().initializeApis(
      configManager.getInstance().get("default").onlineApis
    );
    TranslationManager.getInstance().initializeTranslators(
      configManager.getInstance().get("default").translators
    );
  });

  ipcMain.on(
    types.REQUEST_RUN_GAME,
    (event: Electron.Event, game: Yagt.Game) => {
      mainWindow.hide();

      runningGame = new Game(game);
      runningGame.on("started", () => {
        if (translatorWindow) translatorWindow.close();
        translatorWindow = new TranslatorWindow();
        translatorWindow.setGame(runningGame);
      });
      runningGame.on("exited", () => {
        runningGame.removeAllListeners();
        if (translatorWindow) translatorWindow.close();
        translatorWindow = null;
        mainWindow.show();
      });
      runningGame.start();
    }
  );

  ipcMain.on(
    types.REQUEST_INSERT_HOOK,
    (event: Electron.Event, code: string) => {
      if (code !== "") {
        logger.debug(
          `inserting hook ${code} to process ${runningGame.getPid()}...`
        );
        hooker.getInstance().insertHook(runningGame.getPid(), code);
        logger.debug(`hook ${code} inserted`);
      }
    }
  );

  ipcMain.on(types.REQUEST_CONFIG, (event: Electron.Event, name: string) => {
    if (name === "game") {
      requestGame(event);
      return;
    }
    logger.debug(
      `request config ${configManager.getInstance().getFilename(name)}`
    );
    sendConfig(name, event);
  });

  function requestGame(event: Electron.Event) {
    if (translatorWindow) {
      logger.debug(`request config ${translatorWindow.getGameInfo()}`);
      sendGameInfo(event);
    } else {
      logger.error(`no translator window`);
    }
  }

  ipcMain.on(
    types.REQUEST_SAVE_CONFIG,
    (event: Electron.Event, name: string, cfg: any) => {
      let configFileName = configManager.getInstance().getFilename(name);
      logger.debug(`request saving config ${configFileName}: `);
      logger.debug(cfg);

      configManager.getInstance().set(name, cfg);
      logger.debug(`config ${configFileName} saved`);
      sendConfig(name, event);
    }
  );

  ipcMain.on(
    types.REQUEST_ADD_GAME,
    (event: Electron.Event, game: Yagt.Game) => {
      configManager
        .getInstance()
        .get("games")
        .push(game);
      configManager.getInstance().save("games");
      sendConfig("games", event);
      event.sender.send(types.HAS_ADDED_GAME);
    }
  );

  ipcMain.on(
    types.REQUEST_REMOVE_GAME,
    (event: Electron.Event, game: Yagt.Game) => {
      configManager.getInstance().set("games", {
        games: configManager
          .getInstance()
          .get("games")
          .filter((item: Yagt.Game) => item.name !== game.name)
      });
      sendConfig("games", event);
    }
  );

  ipcMain.on(types.REQUEST_NEW_GAME_PATH, (event: Electron.Event) => {
    dialog.showOpenDialog(
      {
        properties: ["openFile"],
        filters: [{ name: "可执行文件", extensions: ["exe"] }]
      },
      files => {
        if (files) {
          event.sender.send(types.HAS_NEW_GAME_PATH, files[0]);
        }
      }
    );
  });

  ipcMain.on(types.APP_EXIT, () => {
    app.quit();
  });

  ipcMain.on(
    types.REQUEST_TRANSLATION,
    (event: Electron.Event, text: string) => {
      TranslationManager.getInstance().translate(text, translation => {
        event.sender.send(types.HAS_TRANSLATION, translation);
      });
    }
  );
}

function sendConfig(configName: string, event: Electron.Event) {
  event.sender.send(
    types.HAS_CONFIG,
    configName,
    configManager.getInstance().get(configName)
  );
}

function sendGameInfo(event: Electron.Event) {
  event.sender.send(
    types.HAS_CONFIG,
    "game",
    (<TranslatorWindow>translatorWindow).getGameInfo()
  );
}

app.on("before-quit", () => {
  if (translatorWindow) {
    logger.info("closing translator window...");
    translatorWindow.close();
    translatorWindow = null;
  }
  logger.info("app quited");
});
