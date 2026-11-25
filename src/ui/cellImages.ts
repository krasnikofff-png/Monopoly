// Значки особых клеток — нарисованные картинки (старт, тюрьма, вокзалы, службы, шанс, сюрприз…).
// Улицы по-прежнему рисуются векторными значками из icons.ts.
import chance from './cells/chance.webp';
import electric from './cells/electric.webp';
import gotojail from './cells/gotojail.webp';
import jail from './cells/jail.webp';
import park from './cells/park.webp';
import start from './cells/start.webp';
import stationBlue from './cells/station-blue.webp';
import stationGreen from './cells/station-green.webp';
import stationPurple from './cells/station-purple.webp';
import stationRed from './cells/station-red.webp';
import surprise from './cells/surprise.webp';
import tax from './cells/tax.webp';
import water from './cells/water.webp';

export const CELL_IMAGES: Record<number, string> = {
  0: start,
  2: surprise,
  4: surprise,
  5: stationRed,
  7: chance,
  10: jail,
  12: electric,
  15: stationBlue,
  17: surprise,
  20: park,
  22: chance,
  25: stationGreen,
  28: water,
  30: gotojail,
  33: surprise,
  35: stationPurple,
  36: chance,
  38: tax,
};
