// Installs the resolver hook before anything else is imported.
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
