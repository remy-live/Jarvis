import { CONFIG } from './Config.js';

/**
 * GESTION AUDIO (Howler.js)
 *
 * Les fichiers son sont optionnels : si `assets/sounds/...` est absent,
 * le jeu continue sans bruit au lieu de cracher des erreurs à chaque frame.
 */
export class AudioManager {
    constructor() {
        this.currentMusic = null;
        this.currentMusicPath = '';
        this.sfxBank = {};
        this.globalCache = {};
        this.missing = new Set();
        this.isMuted = false;
        this.fadeTime = CONFIG.audio.fadeTime;
    }

    /** @param {{music?: string, sfx?: Record<string,string>}} config */
    setupGameAudio(config) {
        this.sfxBank = {};
        if (!config) {
            this.stopMusic();
            return;
        }

        if (config.music) this._transitionMusic(config.music);
        else this.stopMusic();

        if (config.sfx) {
            for (const [id, path] of Object.entries(config.sfx)) {
                const sound = this._getOrLoad(path, false);
                if (sound) this.sfxBank[id] = sound;
            }
        }
    }

    playSFX(id) {
        if (this.isMuted) return;
        const sound = this.sfxBank[id];
        if (sound) sound.play();
    }

    setMuted(isMuted) {
        this.isMuted = isMuted;
        if (window.Howler) window.Howler.mute(isMuted);
    }

    stopMusic() {
        if (!this.currentMusic) return;
        const old = this.currentMusic;
        old.fade(old.volume(), 0, this.fadeTime);
        old.once('fade', () => old.stop());
        this.currentMusic = null;
        this.currentMusicPath = '';
    }

    _transitionMusic(newPath) {
        if (this.currentMusicPath === newPath) return;

        if (this.currentMusic) {
            const old = this.currentMusic;
            old.fade(old.volume(), 0, this.fadeTime);
            old.once('fade', () => old.stop());
        }

        const nextTrack = this._getOrLoad(newPath, true);
        this.currentMusic = nextTrack;
        this.currentMusicPath = nextTrack ? newPath : '';

        if (nextTrack && !this.isMuted) {
            nextTrack.volume(0);
            nextTrack.play();
            nextTrack.fade(0, CONFIG.audio.musicVolume, this.fadeTime);
        }
    }

    _getOrLoad(path, isMusic) {
        if (this.globalCache[path]) return this.globalCache[path];
        if (this.missing.has(path)) return null;

        if (typeof window.Howl === 'undefined') {
            console.warn("🔇 Howler.js absent : l'audio est désactivé.");
            this.missing.add(path);
            return null;
        }

        const sound = new window.Howl({
            src: [path],
            html5: isMusic,
            loop: isMusic,
            volume: isMusic ? CONFIG.audio.musicVolume : CONFIG.audio.sfxVolume,
            onloaderror: () => {
                // Fichier absent : on l'oublie définitivement, sans spammer
                if (!this.missing.has(path)) {
                    console.warn(`🔇 Son introuvable, ignoré : ${path}`);
                    this.missing.add(path);
                }
                delete this.globalCache[path];
                for (const [id, s] of Object.entries(this.sfxBank)) {
                    if (s === sound) delete this.sfxBank[id];
                }
                if (this.currentMusic === sound) {
                    this.currentMusic = null;
                    this.currentMusicPath = '';
                }
            }
        });

        this.globalCache[path] = sound;
        return sound;
    }
}
