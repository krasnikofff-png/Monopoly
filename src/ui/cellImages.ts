// Значки особых клеток — нарисованные картинки (старт, тюрьма, вокзалы, службы, шанс, сюрприз…).
// Улицы по-прежнему рисуются векторными значками из icons.ts.
import chance from './cells/chance.webp?inline';
import electric from './cells/electric.webp?inline';
import gotojail from './cells/gotojail.webp?inline';
import jail from './cells/jail.webp?inline';
import park from './cells/park.webp?inline';
import start from './cells/start.webp?inline';
import stationBlue from './cells/station-blue.webp?inline';
import stationGreen from './cells/station-green.webp?inline';
import stationPurple from './cells/station-purple.webp?inline';
import stationRed from './cells/station-red.webp?inline';
import surprise from './cells/surprise.webp?inline';
import tax from './cells/tax.webp?inline';
import water from './cells/water.webp?inline';

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
