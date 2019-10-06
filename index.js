'use strict';
const Alexa = require('ask-sdk');
const AWS = require('aws-sdk');
const uuidv4 = require('uuid/v4');

const INTENT_REQUEST = 'IntentRequest';
const EXIT_SKILL_MESSAGE = `You need some rest after helping to build the forest.  See you soon!`;
const ERROR_MESSAGE = `Something unexpected happening while you build, I think you should try again!`;
const TRY_AGAIN_MESSAGE = `You are very close to save the earth, try harder.`;
const GAME_COMPLETE_MESSAGE = '%s You have already saved the world. Say restart to play the game again or end to finish.';
const NEW_USER_WELCOME_MESSAGE = 'TODO: I am new user, set me up with proper intro';
const INFO_MESSAGE = `get some help here %s`;
const GAME_OVER_BAD = `You have doomed us all. But this doesn’t have to be the end for us. Please play again and use what you have learned to save Mother Earth`;
const EXTRA_INFO = `Each question you answer correctly gives us one more year with Mother Earth. Every incorrect answer takes us closer to irreversible doom. Get ready and save the Earth. It’s up to you Eco Hero.`;
const EXISTING_USER_WELCOME_MESSAGE = 'You are welcome back to save me again.  Come on at least do this time properly and dont betray me.';

const documentClient = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
var userId = '';
var user = '';
const MAX_QUESTIONS = 20;
const skillBuilder = Alexa.SkillBuilders.custom();
var dbQuestionNo = 1;
var questions = [];

async function createUserOrUpdateUserQuestion(questionNo, correctlyAnswered) {
    const params = {
        TableName: 'eco_user',
        Item: {
            UserId: userId,
            QuestionNo: questionNo,
            CorrectlyAnswered: correctlyAnswered
        }
    };

    try {
        await documentClient.put(params).promise();
        console.log('user created or updated');
        return Promise.resolve(true);
    }
    catch (err) {
        console.log(`unable to create or update user for the userid ${userId}: ${err}`);
        return Promise.resolve(false);
    }
}

async function getUser() {
    const params = {
        TableName: 'eco_user',
        Key: {
            'UserId': userId
        }
    };
    try {
        const data = await documentClient.get(params).promise();
        console.log(`got user for ${userId}: ${JSON.stringify(data)} `);
        user = data.Item;
        return Promise.resolve(Object.keys(data).length > 0);
    }
    catch (err) {
        console.log(`unable to get user for the userid ${userId}: ${err}`);
        return Promise.resolve(false);
    }
}

async function getQuestionsFromDb(questionNo) {
    const params = {
        TableName: "eco_questions",
        FilterExpression: "#no >= :questionNo",
        ExpressionAttributeValues: {
            ":questionNo": questionNo
        },
        ExpressionAttributeNames: {
            "#no": "no"
        }
    };
    try {
        const data = await documentClient.scan(params).promise();
        console.log(`questions: ${JSON.stringify(data)}`);
        questions = data.Items;
        console.log(`questions: ${JSON.stringify(questions)}`);
        return Promise.resolve(data.Count > 0);
    }
    catch (err) {
        console.log(`unable to get questions : ${err}`);
        return Promise.resolve(false);
    }
}

async function askQuestionAudio(handlerInput, currentQuestion, currentOptions) {

    var tempOptions = [];
    currentOptions.forEach((element, index) => {
        tempOptions.push(`Option ${index + 1}: <break time='1s' /> ${element}`);
    });
    const formattedOptions = tempOptions.join("<break time='2s' />");
    const questionAndOptions = `${currentQuestion} <break time='2s' />Your options are: <break time='2s' /> ${formattedOptions}`; 
    return await speak(handlerInput, questionAndOptions, false);

}

async function askQuestions(handlerInput) {
    try {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const askedQuestions = !sessionAttributes.askedQuestions ? [] : sessionAttributes.askedQuestions;
        const correctlyAnswered = !sessionAttributes.correctlyAnswered ? [] : sessionAttributes.correctlyAnswered;
        var currentQuestion = !sessionAttributes.currentQuestion ? '' : sessionAttributes.currentQuestion;
        var currentQuestionNo = !sessionAttributes.currentQuestionNo ? currentQuestionNo : sessionAttributes.currentQuestionNo;
        console.log('session: ' + JSON.stringify(sessionAttributes));
        console.log(`current question no: ${currentQuestionNo}`);

        console.log(questions[currentQuestionNo]);
        currentQuestion = questions[currentQuestionNo].question;
        const currentAnswer = questions[currentQuestionNo].answer;
        const currentExplanation = questions[currentQuestionNo].explanation;
        const currentOptions = questions[currentQuestionNo].options.split(',');

        if (askedQuestions.indexOf(currentQuestion) < 0) {
            const sessionValues = {
                currentQuestion,
                totalQuestions: questions.length,
                currentQuestionNo,
                currentAnswer,
                askedQuestions,
                correctlyAnswered,
                currentExplanation,
                currentOptions
            };
            sessionValues.askedQuestions.push(sessionValues.currentQuestion);
            Object.assign(sessionAttributes, sessionValues);
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            return await askQuestionAudio(handlerInput, currentQuestion, currentOptions);
        }

    } catch (error) {
        console.log('ask questions function: ' + error);
    }
}

async function speak(handlerInput, speechOutput, endSession) {
    if (endSession === null || endSession === undefined)
        endSession = false;
    return await handlerInput.responseBuilder
        .speak(speechOutput)
        .withShouldEndSession(endSession)
        .getResponse();
}


const AnswerHandler = {
    canHandle(handlerInput) {
        console.log(`answer handler: ${JSON.stringify(handlerInput)}`);
        return (handlerInput.requestEnvelope.request.type === INTENT_REQUEST
            && handlerInput.requestEnvelope.request.intent.name === 'ResponseIntent');
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const correctlyAnswered = sessionAttributes.correctlyAnswered;
        const currentQuestion = sessionAttributes.currentQuestion;
        var currentQuestionNo = sessionAttributes.currentQuestionNo;
        var currentOptions = sessionAttributes.currentOptions;
        const expectedAnswer = sessionAttributes.currentAnswer;

        var actualAnswer = handlerInput.requestEnvelope.request.intent.slots.answer.value;
        var actualOption = handlerInput.requestEnvelope.request.intent.slots.optionno.value;

        const answer = actualAnswer.replace(/[^a-zA-Z]/g, '').toString().toLowerCase();
        if (answer === expectedAnswer.toString().toLowerCase() || currentOptions[actualOption] === expectedAnswer) {
            const sessionValues = {
                currentQuestion,
                correctlyAnswered
            };
            sessionValues.correctlyAnswered.push(currentQuestion);
            Object.assign(sessionAttributes, sessionValues);
            handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
            currentQuestionNo++;
            return await askQuestions(handlerInput);
        }
        else {            
            return await speak(handlerInput, 'you are doomed');
        }
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        console.log("Inside SessionEndedRequestHandler");
        return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest' ;
    },
    async handle(handlerInput) {
        console.log(`Session ended with reason: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const currentQuestion = sessionAttributes.currentQuestion;
        const correctlyAnswered = sessionAttributes.correctlyAnswered;
        if (handlerInput.requestEnvelope.request.intent.slots)
        {
        var actualAnswer = handlerInput.requestEnvelope.request.intent.slots.answer.value;
        console.log(actualAnswer);
        var user = await createUserOrUpdateUserQuestion(currentQuestion, correctlyAnswered.length);
        if (user) {
            return handlerInput.responseBuilder.getResponse();
        }
    }
    },
};

const ErrorHandler = {
    canHandle() {
        console.log("Inside ErrorHandler");
        return true;
    },
    handle(handlerInput, error) {
        console.log(`Error handled: ${error}`);
        console.log(`Handler Input: ${handlerInput}`);

        return speak(handlerInput, ERROR_MESSAGE);
    },
};

const HelpHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;
        return request.type === INTENT_REQUEST &&
            request.intent.name === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        console.log("Inside HelpHandler - handle");
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const currentExplanation = sessionAttributes.currentExplanation;
        return speak(handlerInput, INFO_MESSAGE.replace(/%s/g, currentExplanation));
    },
};


const ExitHandler = {
    canHandle(handlerInput) {
        const request = handlerInput.requestEnvelope.request;

        return request.type === INTENT_REQUEST && (
            request.intent.name === 'AMAZON.StopIntent' ||
            request.intent.name === 'AMAZON.PauseIntent' ||
            request.intent.name === 'AMAZON.CancelIntent'
        );
    },
    handle(handlerInput) {
        return speak(handlerInput, EXIT_SKILL_MESSAGE, true);
    },
};

const ContinueHandler = {
    canHandle(handlerInput) {
        return (handlerInput.requestEnvelope.request.type === INTENT_REQUEST
            && handlerInput.requestEnvelope.request.intent.name === 'ContinueIntent');
    },
    async handle(handlerInput) {
        await getQuestionsFromDb(dbQuestionNo);
        return await askQuestions(handlerInput);
    }
};

const NewHandler = {
    canHandle(handlerInput) {
        return (handlerInput.requestEnvelope.request.type === INTENT_REQUEST
            && (handlerInput.requestEnvelope.request.intent.name === 'NewIntent'
                || handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StartOverIntent'));
    },
    async handle(handlerInput) {
        handlerInput.attributesManager.setSessionAttributes({});
        dbQuestionNo = 1;
        questions = [];
        await getQuestionsFromDb(dbQuestionNo);
        await createUserOrUpdateUserQuestion(dbQuestionNo, 0);
        return await askQuestions(handlerInput);
    }
};

const RepeatHandler = {
    canHandle(handlerInput) {
        console.log(`repeat handler: ${JSON.stringify(handlerInput)}`);
        return (handlerInput.requestEnvelope.request.type === INTENT_REQUEST
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.RepeatIntent');
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const currentQuestion = sessionAttributes.currentQuestion;
        const currentOptions = sessionAttributes.currentOptions;
        return await askQuestionAudio(handlerInput, currentQuestion, currentOptions);
    }
};

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
    },
    async handle(handlerInput) {
        console.log('handler input: ' + JSON.stringify(handlerInput));
        try {
            userId = handlerInput.requestEnvelope.context.System.user.userId;
            var hasUser = await getUser();
            console.log('user found?: ' + hasUser.toString());
            if (!hasUser) {
                var userCreated = await createUserOrUpdateUserQuestion(dbQuestionNo, 0);
                if (!userCreated) {
                    return await speak(handlerInput, ERROR_MESSAGE);
                }
                return await speak(handlerInput, NEW_USER_WELCOME_MESSAGE + '<break time=2s />' + EXTRA_INFO);
            } else {
                dbQuestionNo = user.QuestionNo;
                console.log('current question: ' + dbQuestionNo);
                if (dbQuestionNo >  MAX_QUESTIONS) {
                    return await speak(handlerInput, GAME_COMPLETE_MESSAGE.replace('%s', `<say-as interpret-as="interjection">get some audio here, when the game is over</say-as>`));
                }
                // var existingUserWelcomeMessage = dbQuestionNo == 1 ? EXISTING_USER_WELCOME_MESSAGE_PART1 : EXISTING_USER_WELCOME_MESSAGE_PART1 + EXISTING_USER_WELCOME_MESSAGE_PART2;
                return await speak(handlerInput, EXISTING_USER_WELCOME_MESSAGE);
            }
        } catch (error) {
            console.log(`error from launch request: ${error}`);
        }
    }
};


exports.handler = skillBuilder
    .addRequestHandlers(
        LaunchRequestHandler,
        NewHandler,
        ContinueHandler,
        AnswerHandler,
        RepeatHandler,
        HelpHandler,
        ExitHandler,
        SessionEndedRequestHandler
    )
    .addErrorHandlers(ErrorHandler)
    .lambda();

