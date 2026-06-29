import { GoogleGenerativeAI } from "../lib/generative-ai.mjs";

// ─────────────────────────────────────────────
// CONFIGURAÇÃO DA IA
// Cole sua chave do Gemini aqui antes de testar.
// Pegue uma chave gratuita em: https://aistudio.google.com/app/apikey
// ─────────────────────────────────────────────
const API_KEY = "AIzaSyBj4bfhmrdxS0uIWmzxCct2xjCY38tSzjg";
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

// ── REFS DO DOM ──
const viewRequest = document.getElementById("viewRequest");
const viewListen = document.getElementById("viewListen");
const btnRequestButton = document.getElementById("btnRequestPermission");
const btnDenied = document.getElementById("btnDenied");
const iconWrap = document.getElementById("iconWrap");
const statusTitle = document.getElementById("statusTitle");
const transcriptText = document.getElementById("transcriptText");
const aiStatus = document.getElementById("aiStatus");
const aiStatusLabel = document.getElementById("aiStatusLabel");
const aiStatusText = document.getElementById("aiStatusText");
const hintClose = document.getElementById("hintClose");

btnRequestButton.addEventListener("click", requestMicAndStart);

// Se a permissão já tiver sido concedida antes, pula direto pra escuta.
navigator.permissions?.query({ name: "microphone" }).then((status) => {
  if (status.state === "granted") {
    iniciarEscuta();
  }
}).catch(() => {
  // navegador não suporta query de permissão; mantém o botão de pedir permissão
});

async function requestMicAndStart() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    iniciarEscuta();
  } catch (e) {
    console.error("Permissão de microfone negada ou erro:", e);
    btnDenied.classList.add("visible");
  }
}

// ─────────────────────────────────────────────
// RECONHECIMENTO DE VOZ
// ─────────────────────────────────────────────
function iniciarEscuta() {
  viewRequest.style.display = "none";
  viewListen.style.display = "flex";

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    statusTitle.textContent = "Não suportado";
    transcriptText.textContent = "Reconhecimento de voz não disponível neste navegador.";
    return;
  }

  const recognition = new SpeechRec();
  recognition.lang = "pt-BR";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    iconWrap.classList.add("pulse");
    statusTitle.textContent = "Ouvindo...";
    transcriptText.textContent = "Pode falar";
  };

  recognition.onresult = (e) => {
    const interim = Array.from(e.results).map((r) => r[0].transcript).join("");
    transcriptText.textContent = interim || "Pode falar";

    if (e.results[e.results.length - 1].isFinal) {
      processarComando(interim.trim());
    }
  };

  recognition.onerror = (e) => {
    iconWrap.classList.remove("pulse");
    statusTitle.textContent = "Erro no microfone";
    transcriptText.textContent = e.error;
  };

  recognition.onend = () => {
    iconWrap.classList.remove("pulse");
  };

  try {
    recognition.start();
  } catch (e) {
    console.error(e);
  }
}

// ─────────────────────────────────────────────
// IA (GEMINI) — interpreta o comando e devolve uma ação estruturada
// ─────────────────────────────────────────────
const ACOES_VALIDAS = [
  "ABRIR_SITE", "BUSCAR", "NOVA_ABA", "FECHAR_ABA",
  "VOLTAR", "AVANCAR", "RECARREGAR", "ROLAR", "ZOOM"
];

function montarPrompt(textoUsuario) {
  return `
Você é o cérebro de uma extensão de navegador controlada por voz. Sua única tarefa é converter o comando de voz do usuário em uma ação estruturada que o navegador vai executar.

Responda SEMPRE e SOMENTE com um JSON válido, sem markdown, sem texto antes ou depois, no seguinte formato:

Se o comando for claro e executável:
{"entendido": true, "acao": "NOME_DA_ACAO", "param": "valor ou null"}

Se o comando for ambíguo, incompleto, ou você não souber o que fazer:
{"entendido": false, "pergunta": "uma pergunta curta e direta pedindo para o usuário esclarecer"}

Ações disponíveis (use exatamente esses nomes em "acao"):
- ABRIR_SITE (param: nome do site ou domínio, ex: "youtube", "github.com")
- BUSCAR (param: termo de busca, ex: "receita de bolo de chocolate")
- NOVA_ABA (param: null)
- FECHAR_ABA (param: null)
- VOLTAR (param: null)
- AVANCAR (param: null)
- RECARREGAR (param: null)
- ROLAR (param: "cima", "baixo", "topo" ou "fim")
- ZOOM (param: "in", "out" ou "reset")

Exemplos:
Usuário: "abre o youtube" → {"entendido": true, "acao": "ABRIR_SITE", "param": "youtube"}
Usuário: "pesquisa receita de bolo" → {"entendido": true, "acao": "BUSCAR", "param": "receita de bolo"}
Usuário: "volta" → {"entendido": true, "acao": "VOLTAR", "param": null}
Usuário: "desce a página" → {"entendido": true, "acao": "ROLAR", "param": "baixo"}
Usuário: "abre aí" → {"entendido": false, "pergunta": "Abrir o quê? Me diga o nome do site ou o que você quer buscar."}
Usuário: "faz aquilo lá" → {"entendido": false, "pergunta": "Não entendi qual ação você quer. Pode repetir de forma mais específica?"}

Comando do usuário: "${textoUsuario}"
`.trim();
}

async function processarComando(texto) {
  if (!texto) return;

  iconWrap.classList.remove("pulse");
  statusTitle.textContent = "Processando...";
  transcriptText.textContent = `"${texto}"`;
  avisarSidebar({ tipo: "TRANSCRICAO", texto });

  if (!genAI) {
    mostrarErroNaTela("Chave da API do Gemini não configurada (sidebar/permission.js).");
    return;
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(montarPrompt(texto));
    const resposta = extrairJson(result.response.text().trim());

    if (!resposta) {
      mostrarPerguntaNaTela("Não consegui interpretar a resposta da IA. Pode repetir o comando?");
      return;
    }

    if (resposta.entendido === false) {
      mostrarPerguntaNaTela(resposta.pergunta || "Pode explicar melhor o que você quer fazer?");
      return;
    }

    if (resposta.entendido === true && ACOES_VALIDAS.includes(resposta.acao)) {
      statusTitle.textContent = "Executando...";
      aiStatus.style.display = "none";

      const resultadoExecucao = await enviarParaServiceWorker(resposta.acao, resposta.param);

      if (resultadoExecucao.ok) {
        statusTitle.textContent = "✓ Feito!";
        transcriptText.textContent = resultadoExecucao.result?.mensagem || "Ação executada";
        avisarSidebar({ tipo: "SUCESSO", mensagem: transcriptText.textContent });
        hintClose.textContent = "Fechando esta aba...";
        setTimeout(() => window.close(), 1400);
      } else {
        mostrarErroNaTela(`Não consegui completar a ação: ${resultadoExecucao.error}`);
      }
    } else {
      mostrarPerguntaNaTela("Não tenho certeza do que fazer com esse comando. Pode explicar de outro jeito?");
    }
  } catch (err) {
    console.error(err);
    mostrarErroNaTela("Erro ao conectar com a IA. Verifique sua conexão ou a chave de API.");
  }
}

function mostrarPerguntaNaTela(pergunta) {
  statusTitle.textContent = "Preciso de mais detalhes";
  transcriptText.textContent = "";
  aiStatus.style.display = "block";
  aiStatusLabel.textContent = "IA pergunta";
  aiStatusText.textContent = pergunta;
  avisarSidebar({ tipo: "PERGUNTA", pergunta });
  hintClose.textContent = "Você pode falar de novo ou fechar esta aba.";
  // Permite tentar de novo: reinicia escuta após pequena pausa
  setTimeout(() => iniciarEscuta(), 1200);
}

function mostrarErroNaTela(msg) {
  statusTitle.textContent = "Algo deu errado";
  transcriptText.textContent = "";
  aiStatus.style.display = "block";
  aiStatusLabel.textContent = "Erro";
  aiStatusText.textContent = msg;
  avisarSidebar({ tipo: "ERRO", mensagem: msg });
}

function extrairJson(texto) {
  let limpo = texto.replace(/```json|```/gi, "").trim();
  try {
    return JSON.parse(limpo);
  } catch (e) {
    const match = limpo.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e2) { return null; }
    }
    return null;
  }
}

function enviarParaServiceWorker(acao, param) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "EXECUTE_ACTION", action: acao, param },
      (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false, error: "Sem resposta do background" });
        }
      }
    );
  });
}

// Avisa a sidebar (se estiver aberta) sobre o que está acontecendo nesta aba.
function avisarSidebar(payload) {
  chrome.runtime.sendMessage({ type: "MIC_TAB_UPDATE", payload }, () => {
    // ignora erro caso a sidebar não esteja escutando
    if (chrome.runtime.lastError) { /* noop */ }
  });
}
