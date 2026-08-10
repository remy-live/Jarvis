/**
 * PELLICULE
 *
 * Panneau qui montre la dernière capture en grand et la liste des captures
 * de la session en vignettes. Purement DOM : il ne sait ni composer une
 * image, ni enregistrer une vidéo, il reçoit des éléments et les affiche.
 */
export class CaptureGallery {
    /**
     * @param {object} handlers
     * @param {(item: object) => void} handlers.onDownload
     * @param {(item: object) => void} handlers.onDelete
     * @param {() => void} [handlers.onChange] - le DOM cliquable a changé
     */
    constructor({ onDownload, onDelete, onChange = () => {} }) {
        this.onDownload = onDownload;
        this.onDelete = onDelete;
        this.onChange = onChange;

        this.items = [];
        this.selected = null;

        this.dom = this._build();
        document.body.appendChild(this.dom);
    }

    get isOpen() {
        return !this.dom.hidden;
    }

    open(items, selected = null) {
        this.items = items;
        this.selected = selected || items[items.length - 1] || null;

        this.dom.hidden = false;
        requestAnimationFrame(() => this.dom.classList.add('is-visible'));
        this._render();
        this.onChange();
    }

    close() {
        this.dom.classList.remove('is-visible');
        setTimeout(() => { this.dom.hidden = true; }, 220);
        this.onChange();
    }

    /** Met à jour la liste sans changer l'état d'ouverture. */
    refresh(items) {
        this.items = items;
        if (!this.items.includes(this.selected)) {
            this.selected = this.items[this.items.length - 1] || null;
        }
        if (!this.selected) {
            this.close();
            return;
        }
        this._render();
        this.onChange();
    }

    // ----------------------------------------------------------

    _build() {
        const root = document.createElement('div');
        root.className = 'gallery';
        root.hidden = true;
        root.innerHTML = `
            <div class="gallery__panel">
                <header class="gallery__head">
                    <h2 class="gallery__title">Pellicule</h2>
                    <span class="gallery__count"></span>
                </header>

                <div class="gallery__stage"></div>

                <div class="gallery__strip" role="list"></div>

                <div class="gallery__actions">
                    <button class="btn-ghost interactive" data-action="download" type="button">Enregistrer</button>
                    <button class="btn-ghost interactive" data-action="delete" type="button">Supprimer</button>
                    <button class="btn-ghost interactive" data-action="close" type="button">Fermer</button>
                </div>
            </div>
        `;

        root.addEventListener('click', (event) => {
            const thumb = event.target.closest('[data-item-id]');
            if (thumb) {
                this.selected = this.items.find((i) => i.id === Number(thumb.dataset.itemId)) || this.selected;
                this._render();
                return;
            }

            const action = event.target.dataset?.action;
            if (action === 'download') this.onDownload(this.selected);
            else if (action === 'delete') this.onDelete(this.selected);
            else if (action === 'close' || event.target === root) this.close();
        });

        return root;
    }

    _render() {
        const stage = this.dom.querySelector('.gallery__stage');
        const strip = this.dom.querySelector('.gallery__strip');
        const count = this.dom.querySelector('.gallery__count');

        count.textContent = this.items.length > 1 ? `${this.items.length} captures` : '1 capture';

        // Scène principale
        stage.innerHTML = '';
        if (this.selected) {
            stage.appendChild(this._buildStageMedia(this.selected));
        }

        // Bande de vignettes (masquée s'il n'y a qu'un élément)
        strip.hidden = this.items.length < 2;
        strip.innerHTML = '';
        for (const item of [...this.items].reverse()) {
            strip.appendChild(this._buildThumb(item));
        }
    }

    _buildStageMedia(item) {
        if (item.type === 'video') {
            const video = document.createElement('video');
            video.className = 'gallery__media';
            video.src = item.url;
            video.poster = item.poster;
            video.controls = true;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            return video;
        }

        const img = document.createElement('img');
        img.className = 'gallery__media';
        img.src = item.url;
        img.alt = 'Capture de la partie';
        return img;
    }

    _buildThumb(item) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gallery__thumb interactive';
        button.dataset.itemId = String(item.id);
        button.setAttribute('role', 'listitem');
        button.classList.toggle('is-selected', item === this.selected);

        const img = document.createElement('img');
        img.src = item.poster;
        img.alt = '';
        button.appendChild(img);

        if (item.type === 'video') {
            const badge = document.createElement('span');
            badge.className = 'gallery__badge';
            badge.textContent = formatDuration(item.duration);
            button.appendChild(badge);
        }

        return button;
    }
}

function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
