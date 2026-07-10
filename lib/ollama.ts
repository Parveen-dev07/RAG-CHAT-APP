import {ChatOllama, OllamaEmbeddings} from '@langchain/ollama'

export function getEmbeddings(){
    return new OllamaEmbeddings({
  model:'nomic-embed-text',
  baseUrl:'http://localhost:11434'

    })
}

export function getChatModel(){
    return new ChatOllama({
    model: "llama3.2",
    baseUrl: "http://localhost:11434",
    temperature: 0.3,
        
    })
}

