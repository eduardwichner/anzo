// Badge texts. Badges come from the server as { id, family, n?, cefr?, title? } (server/src/lib/badges.js).
import { t } from '../i18n/index.js';
import { levelName } from '../components/LevelBar.jsx';

export const badgeTitle = (b) => (b.family === 'level' ? t('badges.level.title', { level: levelName(b) }) : t(`badges.${b.id}.title`));
export const badgeCondition = (b) => (b.family === 'level' ? t('badges.level.condition', { level: levelName(b) }) : t(`badges.${b.id}.condition`));
