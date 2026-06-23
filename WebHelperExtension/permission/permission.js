const btnRequestButton = document.getElementById("btnRequestPermission");
const btnGranted = document.getElementById("btnGranted");
const btnDenied = document.getElementById("btnDenied");


btnRequestButton.addEventListener("click", requestMic)

function showGranted(){
    btnDenied.style.display = 'none';
    btnGranted.style.display = 'block';
    
}

async function showDenied(){
    btnDenied.style.display = 'block';
    btnGranted.style.display = 'none';
}

async function requestMic(){

    try{
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});

        stream.getTracks().forEach(track => track.stop());
    } catch(e){

    }

}