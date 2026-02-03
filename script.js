const daySelect = document.getElementById('daySelect');
const monthSelect = document.getElementById('monthSelect');
const yearSelect = document.getElementById('yearSelect');
const exploreBtn = document.getElementById('exploreBtn');
const randomBtn = document.getElementById('randomBtn');
const resultContainer = document.getElementById('resultContainer');
const loader = document.getElementById('loader');
const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');

let autoAdvanceTimer = null;
let currentYear = 2026;

// Global Canvas (Background Stars)
const canvas = document.getElementById('starsCanvas');
const ctx = canvas.getContext('2d');

// Space Cluster Canvas (Rotating Planet)
const spaceCanvas = document.getElementById('spaceInteractiveCanvas');
const sCtx = spaceCanvas.getContext('2d');

const NASA_API_KEY = 'DEMO_KEY';

// --- Web Audio Engine ---
let audioCtx = null;
let delayNode, feedbackGain, reverbNode, reverbGain, chorusNode, chorusLFO, droneOsc, droneGain;
let masterGain, filterNode;
let modulationActive = true;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8;
    masterGain.connect(audioCtx.destination);

    // Chorus
    chorusNode = audioCtx.createDelay();
    chorusNode.delayTime.value = 0.02;
    chorusLFO = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    chorusLFO.frequency.value = 0.5;
    lfoGain.gain.value = 0.003;
    chorusLFO.connect(lfoGain);
    lfoGain.connect(chorusNode.delayTime);
    chorusLFO.start();

    // Delay with Feedback
    delayNode = audioCtx.createDelay(2.0);
    delayNode.delayTime.value = 0.4;
    feedbackGain = audioCtx.createGain();
    feedbackGain.gain.value = 0.3;

    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    // Reverb
    reverbNode = audioCtx.createConvolver();
    reverbGain = audioCtx.createGain();
    reverbGain.gain.value = 0.5;
    createReverbPulse();

    // FX Chain: Chorus -> Delay -> Reverb -> Master
    chorusNode.connect(delayNode);
    delayNode.connect(reverbGain);
    reverbGain.connect(masterGain);

    // Drone (Set to 0 by default as per request)
    droneOsc = audioCtx.createOscillator();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.value = 55;
    droneGain = audioCtx.createGain();
    droneGain.gain.value = 0;

    const droneLowpass = audioCtx.createBiquadFilter();
    droneLowpass.type = 'lowpass';
    droneLowpass.frequency.value = 150;

    droneOsc.connect(droneLowpass);
    droneLowpass.connect(droneGain);
    droneGain.connect(masterGain);
    droneOsc.start();

    // Start Modulation Loop
    animateModulation();
}

async function createReverbPulse() {
    if (!audioCtx) return;
    const len = audioCtx.sampleRate * 2.5;
    const buf = audioCtx.createBuffer(2, len, audioCtx.sampleRate);
    for (let c = 0; c < 2; c++) {
        const data = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.5);
        }
    }
    reverbNode.buffer = buf;
}

function connectAudioSource(element) {
    if (!audioCtx) initAudio();
    if (element.captured) return true;

    try {
        const source = audioCtx.createMediaElementSource(element);
        source.connect(masterGain); // Dry
        source.connect(chorusNode); // Wet
        element.captured = true;
        return true;
    } catch (e) {
        console.warn("Audio capture blocked (CORS):", e);
        return false;
    }
}

// --- Online Modulation Logic ---
const modParams = {
    delay: { el: 'delayFader', modEl: 'modDelay' },
    chorus: { el: 'chorusFader', modEl: 'modChorus' },
    reverb: { el: 'reverbFader', modEl: 'modReverb' },
    drone: { el: 'droneFader', modEl: 'modDrone' }
};

function animateModulation() {
    if (!modulationActive || !audioCtx) return;

    const time = Date.now() * 0.001;

    Object.keys(modParams).forEach((key, i) => {
        const p = modParams[key];
        const fader = document.getElementById(p.el);
        if (!fader) return;

        const baseVal = parseFloat(fader.value);
        const drift = Math.sin(time * (0.3 + i * 0.2)) * 0.05;
        const modulatedVal = Math.max(0, Math.min(1, baseVal + drift));

        // Update indicators (visual only)
        const indicator = document.getElementById(p.modEl);
        if (indicator) {
            indicator.style.width = (modulatedVal * 100) + '%';
        }

        // Apply to Audio Nodes
        if (key === 'delay' && delayNode) {
            delayNode.delayTime.setTargetAtTime(modulatedVal * 1.5, audioCtx.currentTime, 0.1);
            feedbackGain.gain.setTargetAtTime(0.2 + modulatedVal * 0.5, audioCtx.currentTime, 0.1);
        }
        if (key === 'chorus' && chorusNode) {
            chorusNode.delayTime.setTargetAtTime(0.01 + modulatedVal * 0.04, audioCtx.currentTime, 0.1);
        }
        if (key === 'reverb' && reverbGain) {
            reverbGain.gain.setTargetAtTime(modulatedVal * 0.8, audioCtx.currentTime, 0.1);
        }
        if (key === 'drone' && droneGain) {
            droneGain.gain.setTargetAtTime(modulatedVal * 0.2, audioCtx.currentTime, 0.1);
            droneOsc.frequency.setTargetAtTime(55 + (currentYear % 50) + drift * 20, audioCtx.currentTime, 0.5);
        }
    });

    requestAnimationFrame(animateModulation);
}

// --- Global Stars ---
let stars = [];
function initStars() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    stars = [];
    for (let i = 0; i < 200; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 1.5,
            speed: Math.random() * 0.05 + 0.02,
            hue: Math.random() * 360
        });
    }
}

function animateStars() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
        s.y += s.speed;
        s.hue += 0.1;
        if (s.y > canvas.height) s.y = 0;
        ctx.fillStyle = `hsl(${s.hue}, 70%, 70%)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
    });
    requestAnimationFrame(animateStars);
}

// --- Rotating Planet Projector ---
let planetDots = [];
let rotationAngle = 0;
let planetHue = 200;
let rotationSpeed = 0.005;

function initPlanet() {
    const container = spaceCanvas.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    spaceCanvas.width = rect.width || 300;
    spaceCanvas.height = rect.height || 300;
    planetDots = [];

    const count = 300;
    const radius = Math.min(spaceCanvas.width, spaceCanvas.height) * 0.35;

    for (let i = 0; i < count; i++) {
        const phi = Math.acos(-1 + (2 * i) / count);
        const theta = Math.sqrt(count * Math.PI) * phi;
        planetDots.push({
            x: Math.cos(theta) * Math.sin(phi) * radius,
            y: Math.sin(theta) * Math.sin(phi) * radius,
            z: Math.cos(phi) * radius,
            size: Math.random() * 2 + 1
        });
    }
}

function animatePlanet() {
    sCtx.clearRect(0, 0, spaceCanvas.width, spaceCanvas.height);
    const cx = spaceCanvas.width / 2;
    const cy = spaceCanvas.height / 2;
    rotationAngle += rotationSpeed;

    const projected = planetDots.map(d => {
        const cosY = Math.cos(rotationAngle);
        const sinY = Math.sin(rotationAngle);
        const xRot = d.x * cosY - d.z * sinY;
        const zRot = d.x * sinY + d.z * cosY;
        const perspective = 500 / (500 + zRot);
        const scale = perspective;
        return {
            x: cx + xRot * scale,
            y: cy + d.y * scale,
            z: zRot,
            scale: scale,
            alpha: (zRot + 300) / 600
        };
    }).sort((a, b) => b.z - a.z);

    projected.forEach(p => {
        sCtx.fillStyle = `hsla(${planetHue}, 80%, 70%, ${p.alpha})`;
        sCtx.beginPath();
        sCtx.arc(p.x, p.y, p.scale * 2, 0, Math.PI * 2);
        sCtx.fill();
    });
    requestAnimationFrame(animatePlanet);
}

// --- Data Logic ---
function initSelectors() {
    daySelect.innerHTML = ''; monthSelect.innerHTML = ''; yearSelect.innerHTML = '';
    for (let i = 1; i <= 31; i++) {
        const val = i.toString().padStart(2, '0');
        daySelect.add(new Option(val, val));
    }
    for (let i = 1; i <= 12; i++) {
        const val = i.toString().padStart(2, '0');
        monthSelect.add(new Option(val, val));
    }
    for (let i = 2026; i >= 1900; i--) {
        yearSelect.add(new Option(i, i.toString()));
    }
    yearSelect.value = "1995";
}

function setRandomDate() {
    const minYear = 1950;
    const maxYear = 2025;

    // Generate valid random date using Date object to handle month lengths automatically
    const startTs = new Date(minYear, 0, 1).getTime();
    const endTs = new Date(maxYear, 11, 31).getTime();
    const randomTs = startTs + Math.random() * (endTs - startTs);
    const date = new Date(randomTs);

    const y = date.getFullYear().toString();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');

    // Update selectors using values
    if (yearSelect.querySelector(`option[value="${y}"]`)) yearSelect.value = y;
    monthSelect.value = m;
    daySelect.value = d;
}

// Initialization flow
initStars();
animateStars();
initSelectors();
initPlanet();
animatePlanet();

// Automatic startup as soon as everything is ready
window.addEventListener('load', () => {
    // Start first load with a slight delay
    setTimeout(() => {
        setRandomDate();
        exploreBtn.click();
        // Try initialize audio (might require interaction in some browsers)
        initAudio();
    }, 500);
});

randomBtn.onclick = () => {
    setRandomDate();
    exploreBtn.click();
};

window.onresize = () => {
    initStars();
    initPlanet();
};

exploreBtn.onclick = async () => {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    const d = daySelect.value;
    const m = monthSelect.value;
    const y = yearSelect.value;
    currentYear = parseInt(y);
    const selectedDate = `${y}-${m}-${d}`;

    planetHue = (currentYear * 1.5) % 360;
    rotationSpeed = 0.003 + (currentYear % 50) / 10000;

    resultContainer.classList.add('hidden');
    loader.classList.remove('hidden');

    try {
        const [nasaData, archivePhoto, archiveVideo, newsData, atmosphere] = await Promise.all([
            fetchSpaceData(selectedDate),
            fetchArchivePhoto(selectedDate),
            fetchArchiveVideo(selectedDate),
            fetchArchiveNews(selectedDate),
            generateAtmosphereSummary(selectedDate)
        ]);
        renderResults(selectedDate, nasaData, archivePhoto, archiveVideo, newsData, atmosphere);
    } catch (error) {
        console.error("Explore error:", error);
    } finally {
        loader.classList.add('hidden');
        resultContainer.classList.remove('hidden');
    }
};

async function fetchSpaceData(date) {
    try {
        const response = await fetch(`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&date=${date}`);
        const data = await response.json();
        return data.url ? data : {
            title: "Космічний об'єкт"
        };
    } catch (e) {
        return {
            title: "Глибокий Космос"
        };
    }
}

async function fetchArchivePhoto(date) {
    try {
        const response = await fetch(`https://archive.org/advancedsearch.php?q=date:${date} AND mediatype:image&output=json&limit=1`);
        const data = await response.json();
        const item = data.response.docs[0];
        return item ? { title: item.title, img: `https://archive.org/services/img/${item.identifier}` } : {
            title: "Архівна візуалізація", img: "https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=1000"
        };
    } catch (e) {
        return {
            title: "Архівна візуалізація", img: "https://images.unsplash.com/photo-1532012197267-da84d127e765?q=80&w=1000"
        };
    }
}

async function fetchArchiveVideo(date) {
    const year = date.split('-')[0];
    const month = date.split('-')[1];

    // Helper to perform fetch
    const searchArchive = async (query, limit = 5) => {
        const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&output=json&limit=${limit}`;
        try {
            const res = await fetch(url);
            return await res.json();
        } catch (e) { return { response: { docs: [] } }; }
    };

    try {
        let items = [];

        // 1. Try exact date
        let data = await searchArchive(`date:${date} AND mediatype:movies`);
        items = data.response.docs;

        // 2. If empty, try wider search (Month of that Year)
        if (!items || items.length === 0) {
            console.log("No exact date video, searching month...");
            data = await searchArchive(`year:${year} AND date:${year}-${month}* AND mediatype:movies`, 10);
            items = data.response.docs;
        }

        // 3. If still empty, try just the Year (grab random from top 50)
        if (!items || items.length === 0) {
            console.log("No month video, searching year...");
            data = await searchArchive(`year:${year} AND mediatype:movies`, 50);
            items = data.response.docs;
        }

        if (!items || items.length === 0) {
            return { title: "Відео-хроніка відсутня", id: null, duration: 0, url: null };
        }

        // Pick random item from results
        const item = items[Math.floor(Math.random() * items.length)];

        // Get File Metadata
        try {
            const metaRes = await fetch(`https://archive.org/metadata/${item.identifier}`);
            const metaData = await metaRes.json();
            let duration = 0;
            let videoUrl = null;

            if (metaData.files) {
                // Priority: h.264 > MPEG4 > Any .mp4
                const videoFile = metaData.files.find(f => f.format === 'h.264' || f.format === 'MPEG4' || f.name.toLowerCase().endsWith('.mp4'));

                if (videoFile) {
                    duration = parseFloat(videoFile.duration) || 0;
                    videoUrl = `https://archive.org/download/${item.identifier}/${encodeURIComponent(videoFile.name)}`;
                }
            }
            return { title: item.title, id: item.identifier, duration: duration || 45, url: videoUrl };
        } catch (e) {
            return { title: item.title, id: item.identifier, duration: 45, url: null };
        }

    } catch (e) {
        console.error("Archive Search Error:", e);
        return { title: "Відео-хроніка відсутня", id: null, duration: 0, url: null };
    }
}

function scheduleNextMemory(seconds) {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    const delay = Math.max(15, Math.min(seconds, 3600));
    autoAdvanceTimer = setTimeout(() => {
        randomBtn.click();
    }, delay * 1000);
}

async function fetchArchiveNews(date) {
    try {
        const response = await fetch(`https://archive.org/advancedsearch.php?q=date:${date} AND subject:(news OR highlights)&output=json&limit=3`);
        const data = await response.json();
        return data.response.docs.map(doc => doc.title);
    } catch (e) { return []; }
}

async function generateAtmosphereSummary(date) {
    const dStr = date.split('-').reverse().join('.');
    return `Аналітичний звіт ${dStr}. Спектральний аналіз завершено. Рівень фонової активності стабільний.`;
}

function renderResults(date, nasa, photo, video, news, atmosphere) {
    document.getElementById('displayDate').textContent = date.split('-').reverse().join('.');
    document.getElementById('aiAtmosphere').textContent = atmosphere;

    const videoMedia = document.getElementById('videoMedia');
    videoMedia.innerHTML = '';

    if (video.url) {
        const v = document.createElement('video');
        v.src = video.url;
        v.autoplay = true;
        v.loop = true; // Loop video instead of switching
        v.muted = true; // Fix for autoplay policy
        v.controls = true; // Allow user to unmute
        v.playsInline = true;
        v.crossOrigin = "anonymous";
        v.style.width = "100%";
        v.style.height = "100%";
        v.style.objectFit = "cover";
        v.style.backgroundColor = "#000";

        v.onplay = () => {
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
            try { connectAudioSource(v); } catch (e) { }
        };

        v.onerror = () => {
            console.warn("Video failed to play, falling back to iframe");
            if (video.id) {
                videoMedia.innerHTML = `<iframe id="activeIframe" src="https://archive.org/embed/${video.id}?autoplay=1&mute=1&loop=1" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
                // scheduleNextMemory disabled
                addFullscreenButton(videoMedia);
            }
        };

        v.onended = () => {
            // Auto-advance disabled
            console.log("Video loop.");
        };

        videoMedia.appendChild(v);
        addFullscreenButton(videoMedia);
    } else if (video.id) {
        videoMedia.innerHTML = `<iframe id="activeIframe" src="https://archive.org/embed/${video.id}?autoplay=1&mute=1&loop=1" width="100%" height="100%" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
        // scheduleNextMemory disabled
        addFullscreenButton(videoMedia);
    } else {
        videoMedia.innerHTML = `<img src="https://images.unsplash.com/photo-1485846234645-a62644f84728?q=80&w=1000">`;
    }

    document.getElementById('videoDesc').textContent = video.title;
    document.getElementById('archiveMedia').innerHTML = `<img src="${photo.img}">`;
    document.getElementById('archiveDesc').textContent = photo.title;

    // --- Space Data Integration ---
    const spaceDesc = document.getElementById('spaceDesc');
    const spaceContainer = document.getElementById('spaceClusterContainer');
    const spaceCanvas = document.getElementById('spaceInteractiveCanvas');

    // Ensure canvas stays on top of NASA media
    spaceCanvas.style.position = 'relative';
    spaceCanvas.style.zIndex = '2';

    if (nasa && nasa.url) {
        spaceDesc.textContent = `${nasa.title || "Космічний об'єкт"} | APOD NASA`;

        // Cleanup old media
        const oldNasa = spaceContainer.querySelector('.nasa-bg');
        if (oldNasa) oldNasa.remove();

        // Create new NASA background
        const mediaTag = (nasa.media_type === 'video') ? 'iframe' : 'img';
        const mediaEl = document.createElement(mediaTag);
        mediaEl.className = 'nasa-bg';
        mediaEl.src = nasa.url;
        mediaEl.style.position = 'absolute';
        mediaEl.style.top = '0';
        mediaEl.style.left = '0';
        mediaEl.style.width = '100%';
        mediaEl.style.height = '100%';
        mediaEl.style.objectFit = 'cover';
        mediaEl.style.opacity = '0.5';
        mediaEl.style.zIndex = '1';
        mediaEl.style.border = 'none';
        if (nasa.media_type === 'video') mediaEl.allow = "autoplay; fullscreen";

        spaceContainer.prepend(mediaEl);
    } else {
        spaceDesc.textContent = "Спектральна пустота (дані NASA не отримано)";
        const oldNasa = spaceContainer.querySelector('.nasa-bg');
        if (oldNasa) oldNasa.remove();
    }

    const newsArchive = document.getElementById('newsArchive');
    if (news.length > 0) {
        newsArchive.innerHTML = news.map(n => `<div class="news-item">${n}</div>`).join('');
    } else {
        newsArchive.innerHTML = `<canvas id="newsSpaceCanvas" class="news-space-canvas"></canvas><div class="news-item" style="border:none; text-align:center; padding-top:20px; opacity:0.7;">МЕРЕЖЕВА ТИША...</div>`;
        initNewsSpaceAnimation();
    }
}

function addFullscreenButton(container) {
    const btn = document.createElement('button');
    btn.innerHTML = '⛶';
    btn.title = "Fullscreen";
    btn.style.position = 'absolute';
    btn.style.top = '10px';
    btn.style.left = '10px';
    btn.style.background = 'rgba(0, 0, 0, 0.6)';
    btn.style.color = '#00f3ff';
    btn.style.border = '1px solid #00f3ff';
    btn.style.padding = '5px 8px';
    btn.style.cursor = 'pointer';
    btn.style.zIndex = '100';
    btn.style.fontSize = '14px';

    btn.onclick = () => {
        const elem = container.querySelector('video') || container.querySelector('iframe') || container;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        } else if (container.requestFullscreen) {
            container.requestFullscreen();
        }
    };
    container.appendChild(btn);
}

function initNewsSpaceAnimation() {
    const nCanvas = document.getElementById('newsSpaceCanvas');
    if (!nCanvas) return;
    const nCtx = nCanvas.getContext('2d');
    const rect = nCanvas.parentElement.getBoundingClientRect();
    nCanvas.width = rect.width;
    nCanvas.height = rect.height;
    const dots = Array.from({ length: 30 }, () => ({ x: Math.random() * nCanvas.width, y: Math.random() * nCanvas.height, z: Math.random() * nCanvas.width }));

    function anim() {
        if (!document.getElementById('newsSpaceCanvas')) return;
        nCtx.fillStyle = 'black';
        nCtx.fillRect(0, 0, nCanvas.width, nCanvas.height);
        nCtx.fillStyle = 'white';
        dots.forEach(d => {
            d.z -= 1;
            if (d.z <= 0) d.z = nCanvas.width;
            const k = 128 / d.z;
            const px = (d.x * k + nCanvas.width / 2) % nCanvas.width;
            const py = (d.y * k + nCanvas.height / 2) % nCanvas.height;
            nCtx.beginPath();
            nCtx.arc(px, py, (1 - d.z / nCanvas.width) * 1.5, 0, Math.PI * 2);
            nCtx.fill();
        });
        requestAnimationFrame(anim);
    }
    anim();
}
