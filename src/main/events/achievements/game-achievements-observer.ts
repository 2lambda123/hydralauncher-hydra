import { watch } from "node:fs/promises";
import { getGameAchievementsToWatch } from "./services/get-game-achievements-to-watch";
import { checkUnlockedAchievements } from "./util/check-unlocked-achievements";
import { parseAchievementFile } from "./util/parseAchievementFile";
import { steamGameAchievementRepository } from "@main/repository";

type GameAchievementObserver = {
  [id: number]: AbortController | null;
};

const gameAchievementObserver: GameAchievementObserver = {};

export const startGameAchievementObserver = async (gameId: number) => {
  if (
    gameAchievementObserver[gameId] === null ||
    gameAchievementObserver[gameId]
  ) {
    return;
  }

  console.log(`Starting: ${gameId}`);

  const achievementsToWatch = await getGameAchievementsToWatch(gameId);

  if (!achievementsToWatch) {
    console.log("Not have achievements to observer");
    gameAchievementObserver[gameId] = null;
    return;
  }

  const { steamId, checkedAchievements, achievementFiles } =
    achievementsToWatch;

  gameAchievementObserver[gameId] = new AbortController();

  for (const file of achievementFiles) {
    const achievements = checkedAchievements.all;
    const signal = gameAchievementObserver[gameId]?.signal;
    if (!signal) return;
    console.log(`cracker: ${file.type}, steamId: ${steamId}`);
    (async () => {
      try {
        const watcher = watch(file.filePath, {
          signal,
        });
        for await (const event of watcher) {
          if (event.eventType === "change") {
            console.log("file modified");
            const localAchievementFile = await parseAchievementFile(
              file.filePath
            );

            if (!localAchievementFile) continue;

            const checked = checkUnlockedAchievements(
              file.type,
              localAchievementFile,
              achievements
            );

            if (checked.new) {
              console.log(checked.new);

              steamGameAchievementRepository.update(
                {
                  steamGame: { id: steamId },
                },
                {
                  achievements: JSON.stringify(checked.all),
                }
              );
            }
          }
        }
      } catch (err: any) {
        console.log(`cracker: ${file.type}, steamId ${steamId}`);
        if (err?.name === "AbortError") return;
        throw err;
      }
    })();
  }
};

export const stopGameAchievementObserver = async (gameId: number) => {
  console.log(`Stopping: ${gameId}`);
  gameAchievementObserver[gameId]?.abort();
  delete gameAchievementObserver[gameId];
  return;
};
