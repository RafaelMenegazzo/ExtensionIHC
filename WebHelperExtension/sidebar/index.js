// A sidebar NÃO faz reconhecimento de voz diretamente — o microfone e a IA
// rodam numa aba separada (permission/permission.html), porque o Chrome
// não permite captura de áudio dentro do side panel. A sidebar apenas abre
// essa aba e exibe o progresso recebido de lá em tempo real.

const micBtn = document.getElementById("micBtn");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const hintText = document.getElementById("hintText");
const transcriptEl = document.getElementById("transcriptText");
const aiMessage = document.getElementById("aiMessage");
const aiLabel = document.getElementById("aiLabel");
const aiText = document.getElementById("aiText");

micBtn.addEventListener("click", () => {
  statusDot.classList.remove("error");
  statusDot.classList.add("listening");
  statusText.textContent = "ABRINDO MIC";
  hintText.textContent = "Abrindo janela de escuta...";
  transcriptEl.textContent = "aguardando fala...";
  transcriptEl.classList.remove("active");
  esconderMensagemIA();

  chrome.runtime.sendMessage({ type: "OPEN_MIC" });
});

// Recebe atualizações em tempo real da aba de escuta/IA.
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== "MIC_TAB_UPDATE") return;
  const { tipo, texto, pergunta, mensagem } = message.payload;

  switch (tipo) {
    case "TRANSCRICAO":
      statusDot.classList.remove("listening");
      statusDot.classList.add("active");
      statusText.textContent = "PROCESSANDO";
      hintText.textContent = "Analisando comando...";
      transcriptEl.textContent = texto;
      transcriptEl.classList.add("active");
      break;

    case "PERGUNTA":
      statusDot.classList.remove("active", "listening");
      statusDot.classList.add("error");
      statusText.textContent = "DÚVIDA";
      hintText.textContent = "A IA precisa de mais detalhes";
      mostrarMensagemIA(pergunta, true);
      break;

    case "ORIENTACAO":
      statusDot.classList.remove("listening", "error");
      statusDot.classList.add("active");
      statusText.textContent = "ORIENTANDO";
      hintText.textContent = "Siga o próximo passo";
      mostrarMensagemIA(message.payload.texto, false);
      break;

    case "SUCESSO":
      statusDot.classList.remove("listening", "error");
      statusDot.classList.add("active");
      statusText.textContent = "CONCLUÍDO";
      hintText.textContent = `✓ ${mensagem}`;
      esconderMensagemIA();
      break;

    case "ERRO":
      statusDot.classList.remove("active", "listening");
      statusDot.classList.add("error");
      statusText.textContent = "ERRO";
      mostrarMensagemIA(mensagem, true);
      break;
  }
});

function mostrarMensagemIA(msg, precisaInput = false) {
  aiLabel.classList.add("active");
  aiMessage.classList.add("has-message");
  aiMessage.classList.toggle("needs-input", precisaInput);
  aiText.textContent = msg;
  aiText.classList.add("has-content");
}

function esconderMensagemIA() {
  aiMessage.classList.remove("has-message", "needs-input");
  aiLabel.classList.remove("active");
  aiText.classList.remove("has-content");
  aiText.textContent = "Nenhuma mensagem pendente";
}

function resetarStatus() {
  statusDot.classList.remove("active", "listening", "error");
  statusText.textContent = "INATIVO";
  hintText.textContent = "Clique no microfone para falar";
}
