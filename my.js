const list=[

{id:1, name:"Laptop", price:1200},
{id:2, name:"Desktop", price:2400},
{id:2, name:"notebook", price:2400},



]






const sum=list.reduce((acc,item)=>acc+item.price,0)
console.log(sum);
/*

filter, map, slice: 원본은 가만히 두고 새로운 배열을 만들어 반환합니다. (비파괴적)

splice, push, pop: 원본 배열을 직접 수정합니다. (파괴적)

const sum=list.reduce((acc,item)=>acc+item.price,0)
console.log(sum);

*/