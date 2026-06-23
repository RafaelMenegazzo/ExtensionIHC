const btnRequestButton = document.getElementById("btnRequestPermission");
const btnGranted = document.getElementById("btnGranted");
const btnDenied = document.getElementById("btnDenied");


btnRequestButton.addEventListener("click", requestMic)



async function getPermission(){
    try{

        navigator.permissions.query({name:"microphone"}).then(permissionState => {
            if(permissionState.state === "granted"){
                showGranted();
            }
            permissionState.onchange = () => {
                if(permissionState.state === "granted") showGranted()
            }
        })
    } catch(e){

    }
}

function showGranted(){
    btnDenied.style.display = 'none';
    btnGranted.style.display = 'block';

    chrome.runtime.sendMessage({type: 'PERMISSION_GRANTED'});
    
}

async function showDenied(){
    btnDenied.style.display = 'block';
    btnGranted.style.display = 'none';
}

async function requestMic(){
    btnRequestButton.disabled = true;
    btnRequestButton.textContent = "Aguardando permissão"

    try{
        const stream = await navigator.mediaDevices.getUserMedia({audio: true});

        stream.getTracks().forEach(track => track.stop());
        showGranted()
    } catch(e){             
        showDenied()
        btnRequestButton.disabled = false;
        
    }

}

