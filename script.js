// Configuración del worker para PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const pageIndicator = document.getElementById('page-indicator');
const srAnnouncer = document.getElementById('sr-announcer');

const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnSpeak = document.getElementById('btn-speak');
const btnStopSpeak = document.getElementById('btn-stop-speak');

let pageFlip = null;
let currentZoom = 1;
let pageTexts = []; // Almacenará el texto extraído por página para la lectura
let isSpeaking = false;
let synthesis = window.speechSynthesis;

// 5. Sonido al pasar de página (sintetizado usando Web Audio API sin requerir un mp3 externo)
function playPageTurnSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.15; // 150 ms
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        // Generar ruido blanco suave para simular roce de papel
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, audioCtx.currentTime);

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        noise.start();
    } catch (e) {
        console.log("Soporte de audio no disponible.");
    }
}

// 6. Función para emitir anuncios para lectores de pantalla
function announceForScreenReader(message) {
    if (srAnnouncer) {
        srAnnouncer.textContent = message;
    }
}

// 1. Cargar el PDF "cuento.pdf" ubicado en la raíz del repositorio
document.addEventListener('DOMContentLoaded', () => {
    loadRepoPDF('cuento.pdf');
});

async function loadRepoPDF(pdfUrl) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    pageTexts = [];

    try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdf.numPages;

        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        // Extraer contenido visual y texto de cada página
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            // Renderizado en Canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);

            // Extraer texto para síntesis de voz (Punto 3 y 6)
            const textContent = await page.getTextContent();
            const textItems = textContent.items.map(item => item.str).join(' ');
            pageTexts.push(textItems || `Página ${pageNum}`);
        }

        bookContainer.style.display = 'block';

        // 5. Inicializar biblioteca PageFlip para animaciones visuales
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth,
            minHeight: 400,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        loading.style.display = 'none';
        updatePageIndicator();

        // Registrar eventos de cambio de página
        pageFlip.on('flip', (e) => {
            playPageTurnSound();
            updatePageIndicator();
            if (isSpeaking) {
                stopReading();
                startReadingCurrentPage();
            }
        });

        announceForScreenReader("El cuento ha sido cargado exitosamente. Puede comenzar la lectura.");

    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loading.innerText = 'No se pudo cargar el archivo "cuento.pdf". Verifique que esté guardado en el repositorio.';
        announceForScreenReader('Error al cargar el archivo cuento.pdf.');
    }
}

// Actualizar indicador de páginas y lector de pantalla
function updatePageIndicator() {
    if (!pageFlip) return;
    const current = pageFlip.getCurrentPageIndex() + 1;
    const total = pageFlip.getPageCount();
    pageIndicator.textContent = `Página ${current} / ${total}`;
    announceForScreenReader(`Página ${current} de ${total}`);
}

// 4. Navegación (Página anterior y siguiente)
btnPrev.addEventListener('click', () => {
    if (pageFlip) {
        pageFlip.flipPrev();
    }
});

btnNext.addEventListener('click', () => {
    if (pageFlip) {
        pageFlip.flipNext();
    }
});

// 3 y 8. Agrandar / Achicar el contenido/vista
btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.8) {
        currentZoom += 0.15;
        bookContainer.style.transform = `scale(${currentZoom})`;
        announceForScreenReader(`Tamaño aumentado al ${Math.round(currentZoom * 100)} por ciento`);
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.7) {
        currentZoom -= 0.15;
        bookContainer.style.transform = `scale(${currentZoom})`;
        announceForScreenReader(`Tamaño reducido al ${Math.round(currentZoom * 100)} por ciento`);
    }
});

// 3 y 6. Lectura en voz alta en español (Text-To-Speech)
btnSpeak.addEventListener('click', () => {
    if (!synthesis) {
        alert('Su navegador no soporta lectura en voz alta.');
        return;
    }
    startReadingCurrentPage();
});

btnStopSpeak.addEventListener('click', () => {
    stopReading();
});

function startReadingCurrentPage() {
    synthesis.cancel(); // Detener cualquier lectura previa

    const currentPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
    const textToRead = pageTexts[currentPageIndex];

    if (!textToRead || textToRead.trim() === '') {
        announceForScreenReader("Esta página no contiene texto legible.");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES'; // Configurado en español

    // Buscar una voz nativa en español disponible
    const voices = synthesis.getVoices();
    const spanishVoice = voices.find(voice => voice.lang.startsWith('es'));
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

    utterance.onstart = () => {
        isSpeaking = true;
        btnSpeak.style.display = 'none';
        btnStopSpeak.style.display = 'inline-block';
        announceForScreenReader("Iniciando lectura en voz alta.");
    };

    utterance.onend = () => {
        isSpeaking = false;
        btnSpeak.style.display = 'inline-block';
        btnStopSpeak.style.display = 'none';
        announceForScreenReader("Fin de la lectura de esta página.");
    };

    utterance.onerror = () => {
        isSpeaking = false;
        btnSpeak.style.display = 'inline-block';
        btnStopSpeak.style.display = 'none';
    };

    synthesis.speak(utterance);
}

function stopReading() {
    if (synthesis) {
        synthesis.cancel();
    }
    isSpeaking = false;
    btnSpeak.style.display = 'inline-block';
    btnStopSpeak.style.display = 'none';
    announceForScreenReader("Lectura pausada.");
}