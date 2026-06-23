import express from "express";
import fetch from "node-fetch";

async function run() {
  const res = await fetch("http://localhost:3000/api/admin/check");
  const text = await res.text();
  console.log("Check:", text);
}
run();
