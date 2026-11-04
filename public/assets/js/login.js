const form = document.getElementById("loginForm");
const message = document.getElementById("loginMessage");
const button = document.getElementById("loginButton");
const password = document.getElementById("password");

document.getElementById("year").textContent = new Date().getFullYear();

document.getElementById("togglePassword").addEventListener("click", () => {
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  document.getElementById("togglePassword").textContent = showing ? "Show" : "Hide";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  button.disabled = true;
  button.textContent = "Signing in…";

  try {
    const response = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username.value,
        password: form.password.value
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Sign-in failed.");
    window.location.href = result.redirect;
  } catch (error) {
    message.textContent = error.message || "Could not connect to the server. Is it running?";
    button.disabled = false;
    button.innerHTML = 'Sign in <span>→</span>';
  }
});