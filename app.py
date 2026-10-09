import dashscope
from dashscope.audio.tts_v2 import SpeechSynthesizer

# API Key otomatis terbaca jika sudah dimasukkan ke environment variable,
# atau Anda bisa memasukkannya langsung secara manual:
# dashscope.api_key = "api-key-anda"

# 1. Tentukan file audio referensi yang ingin dikloning beserta transkrip teksnya
reference_audio_path = "suara_saya.wav" 
reference_text = "Halo, selamat datang di tutorial kloning suara."

# 2. Teks baru yang ingin diucapkan oleh suara kloningan tersebut
target_text = "Hari ini kita akan belajar cara menggunakan kecerdasan buatan dari Alibaba Cloud untuk meniru suara manusia secara instan."

# 3. Konfigurasi parameter Voice Cloning
# Catatan: Struktur parameter di bawah disesuaikan dengan instruksi prompt kloning Qwen3-TTS
voice_config = {
    "reference_audio": reference_audio_path,
    "reference_text": reference_text,
    "enable_xvector": False # Disarankan False agar model membaca detail emosi & tekstur audio asli, bukan sekadar embedding statis
}

try:
    # Memanggil model qwen-audio-3.0-tts-plus
    synthesizer = SpeechSynthesizer(model="qwen-audio-3.0-tts-plus")
    
    # Jalankan sintesis teks ke suara
    audio_output = synthesizer.call(
        text=target_text,
        voice_config=voice_config,
        format="mp3",          # Format output: mp3, wav, atau pcm
        sample_rate=24000      # Kualitas output (24kHz standar untuk hasil jernih)
    )
    
    # Simpan hasil kloning suara ke file baru
    with open("hasil_kloning_suara.mp3", "wb") as f:
        f.write(audio_output)
        
    print("Sintesis berhasil! File disimpan sebagai 'hasil_kloning_suara.mp3'")

except Exception as e:
    print(f"Terjadi kesalahan saat pemrosesan: {e}")
