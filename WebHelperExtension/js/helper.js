
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();

const btnStart = document.getElementById('btnStart')


btnStart.addEventListener('click', () => recognition);
