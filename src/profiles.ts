import type { Profile, Sport } from './types.ts';
// Joint and head measurements stay available regardless of movement category.
const bodyMetrics = ['leftShoulder','rightShoulder','leftElbow','rightElbow','leftHip','rightHip','leftKnee','rightKnee','trunk','headTilt','headShift','headHeight'];
export const profiles: Record<Sport, Profile> = {
 fitness: {
  id:'fitness',name:'Fitness Coach',title:'Увидеть движение.\nПонять технику.',
  subtitle:'Разберите тренировку по кадрам: амплитуда, темп и полные циклы движения.',
  tag:'СТУДИЯ ДВИЖЕНИЯ',accent:'#c6ef73',defaultFps:15,
  exercises:[
   {id:'free',label:'Свободное движение',driver:null},
   {id:'squat',label:'Приседания',driver:'knee'},
   {id:'lunge',label:'Выпады и зашагивания',driver:'knee'},
   {id:'pull',label:'Тяги руками',driver:'elbow'},
   {id:'hinge',label:'Становые тяги и наклоны',driver:'hip'},
   {id:'press',label:'Жимы',driver:'elbow',inverted:true},
   {id:'pushup',label:'Отжимания и брусья',driver:'elbow'},
   {id:'pullup',label:'Подтягивания',driver:'elbow'},
   {id:'curl',label:'Сгибания рук',driver:'elbow'},
   {id:'extension',label:'Разгибания рук',driver:'elbow',inverted:true},
   {id:'raise',label:'Подъёмы и разведения рук',driver:'shoulder',inverted:true},
   {id:'leg',label:'Сгибания и разгибания ног',driver:null},
   {id:'calf',label:'Подъёмы на носки',driver:null},
   {id:'core',label:'Упражнения на корпус',driver:null},
   {id:'hold',label:'Статические удержания',driver:null}
  ],
  metrics:[...bodyMetrics],
  scope:'Измеряем проекции углов и наблюдаемые циклы суставов. Они не определяют нагрузку, безопасность или качество упражнения сами по себе.',
  guide:['Один человек в кадре, голова, стопы и кисти видны полностью.','Для сгибания суставов снимайте сбоку, с неподвижной камеры.','Начните и закончите запись в исходной позиции.']
 },
 boxing:{
  id:'boxing',name:'Boxing Coach',title:'Каждое движение.\nВ деталях.',
  subtitle:'Изучайте одиночную технику: разгибание рук, положение головы и кистей, движение корпуса.',
  tag:'ЛАБОРАТОРИЯ ТЕХНИКИ',accent:'#ffb49b',defaultFps:30,
  exercises:[
   {id:'free',label:'Свободное движение',driver:null},
   {id:'straight',label:'Прямые удары',driver:'elbow',inverted:true},
   {id:'hook',label:'Боковые удары',driver:null},
   {id:'uppercut',label:'Удары снизу',driver:null},
   {id:'combination',label:'Комбинации и бой с тенью',driver:null},
   {id:'bag',label:'Работа на мешке',driver:'elbow',inverted:true},
   {id:'defense',label:'Уклоны, нырки и защиты',driver:null},
   {id:'footwork',label:'Стойка и перемещения',driver:null}
  ],
  metrics:[...bodyMetrics,'guard'],
  scope:'Циклы локтя — наблюдаемые разгибания, а не подтверждённые удары. Сила, попадания, защита от удара и результат спарринга не оцениваются.',
  guide:['Снимайте одного спортсмена; спарринг пока не поддерживается.','Оставьте голову, кисти и стопы в кадре, обеспечьте хорошее освещение.','Для быстрых движений выбирайте 30 кадров анализа в секунду.']
 },
 rg:{
  id:'rg',name:'Rhythm Coach',title:'Линии. Амплитуда.\nВаше движение.',
  subtitle:'Посмотрите на форму движения: раскрытие ног, линии рук и коленей, положение головы и корпуса.',
  tag:'СТУДИЯ ГИМНАСТИКИ',accent:'#c3b1ff',defaultFps:15,
  exercises:[
   {id:'free',label:'Свободное движение',driver:null},
   {id:'shape',label:'Формы, растяжка и амплитуда',driver:null},
   {id:'balance',label:'Равновесия',driver:null},
   {id:'jump',label:'Прыжки',driver:null},
   {id:'turn',label:'Повороты и вращения',driver:null},
   {id:'wave',label:'Волны и наклоны корпуса',driver:null},
   {id:'steps',label:'Шаги, связки и перемещения',driver:null},
   {id:'apparatus',label:'Движения тела с предметом',driver:null},
   {id:'routine',label:'Фрагмент упражнения',driver:null}
  ],
  metrics:[...bodyMetrics,'split'],
  scope:'Показываем геометрию тела в плоскости видео. Предметы, трудности, число оборотов, полёт и баллы по правилам FIG не определяются.',
  guide:['Снимайте гимнастку в полный рост с запасом пространства.','Для амплитуды ног выбирайте ракурс в плоскости движения.','Камера должна быть неподвижной; избегайте перекрытий тела и лица.']
 }
};
