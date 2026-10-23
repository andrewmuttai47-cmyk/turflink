function Message(){
    const name = "MUTTAI";
    if (name)
    return <h1>Welcome, {name}!</h1>;
    return <h1>Welcome!</h1>;
}

export default Message;